import {
  CreateMicrovmAuthTokenCommand,
  GetMicrovmCommand,
  ResumeMicrovmCommand,
  RunMicrovmCommand,
  SuspendMicrovmCommand,
  TerminateMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import { randomUUID } from "crypto";
import { dataClient, env, microvms, sleep } from "./clients.js";

/* ---------------- sandbox sessions (P1 workstream 2) ---------------- */

export type SandboxRow = {
  id: string;
  sandboxId?: string | null;
  sessionToken?: string | null;
  endpoint?: string | null;
  status?: string | null;
  provisionedAt?: string | null;
  lastUsedAt?: string | null;
};

/** Newest active row for the owner; heals stale rows (VM gone → terminated). */
export async function findActiveSession(ownerId: string): Promise<SandboxRow | null> {
  const { data } = await dataClient.models.SandboxSession.sandboxSessionsByOwnerId({ ownerId });
  const rows = ((data ?? []) as unknown as SandboxRow[]).filter((r) => r.status === 'active');
  rows.sort((a, b) => String(b.provisionedAt ?? '').localeCompare(String(a.provisionedAt ?? '')));
  for (const row of rows) {
    if (!row.sandboxId) continue;
    if (await vmAlive(row.sandboxId)) return row;
    try {
      await dataClient.models.SandboxSession.update({ id: row.id, status: 'terminated' });
    } catch { /* best-effort heal */ }
  }
  return null;
}

export async function touchSession(id: string): Promise<void> {
  try {
    await dataClient.models.SandboxSession.update({ id, lastUsedAt: new Date().toISOString() });
  } catch { /* best-effort */ }
}

/* ---------------- microvm primitives ---------------- */

/** Terminate and verify: poll until TERMINATED/NotFound. Fire-and-forget
 * terminates have leaked billing VMs when the call raced boot. */
export async function terminateAndVerify(microvmId: string, timeoutMs = 60_000): Promise<boolean> {
  try {
    await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
  } catch (err) {
    if (err instanceof Error && /not found/i.test(`${err.name} ${err.message}`)) return true;
    console.error(`[wayfind-api] terminate call failed for ${microvmId}:`, err);
    return false;
  }
  const start = Date.now();
  for (;;) {
    try {
      const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      const state = res.state as string | undefined;
      if (state === 'TERMINATED' || state === 'FAILED') return true;
    } catch (err) {
      if (err instanceof Error && /not found/i.test(`${err.name} ${err.message}`)) return true;
      console.error(`[wayfind-api] terminate-verify GetMicrovm failed for ${microvmId}:`, err);
      return false;
    }
    if (Date.now() - start > timeoutMs) {
      console.error(`[wayfind-api] LEAKED microvm ${microvmId}: still alive ${timeoutMs / 1000}s after terminate`);
      return false;
    }
    await sleep(5000);
  }
}

/** True when the MicroVM still exists and is resumable/running. */
export async function vmAlive(microvmId: string): Promise<boolean> {
  try {
    const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
    // Cast: the service returns TERMINATED/FAILED at runtime, but the SDK's
    // state union lags behind and a direct literal compare fails tsc.
    const state = res.state as string | undefined;
    return state !== "TERMINATED" && state !== "FAILED";
  } catch (err) {
    if (err instanceof Error && err.name.includes("NotFound")) return false;
    throw err;
  }
}

export async function waitForRunning(microvmId: string, timeoutMs = 5 * 60_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
    if (res.state === "RUNNING") {
      if (!res.endpoint) throw new Error("VM RUNNING but no endpoint");
      return res.endpoint;
    }
    if (res.state === "TERMINATED") throw new Error("VM terminated while starting");
    if (Date.now() - start > timeoutMs) throw new Error(`VM did not reach RUNNING in ${timeoutMs / 1000}s`);
    await sleep(10_000);
  }
}

export async function vmFetch(
  endpoint: string,
  token: string,
  path: string,
  body?: unknown,
  sessionToken?: string,
): Promise<Response> {
  return fetch(`https://${endpoint}${path}`, {
    method: "POST",
    headers: {
      "X-aws-proxy-auth": token,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function mintVmToken(microvmId: string, expirationInMinutes = 30): Promise<string> {
  const out = await microvms.send(
    new CreateMicrovmAuthTokenCommand({
      microvmIdentifier: microvmId,
      expirationInMinutes,
      allowedPorts: [{ port: 8080 }],
    }),
  );
  const token = (out.authToken as Record<string, string> | undefined)?.["X-aws-proxy-auth"];
  if (!token) throw new Error("token mint returned no auth token");
  return token;
}

/* ---------------- computer lifecycle (provision/action) ---------------- */

export type ComputerRow = {
  id: string;
  provisionStatus?: string | null;
  microvmId?: string | null;
  updatedAt?: string | null;
};

/** Deterministic pick among an owner's Computer rows. The GSI has no sort
 * key, so [0] is undefined order — and a create race can leave duplicates.
 * Prefer the row holding a MicroVM, newest first. */
export function pickComputer<T extends ComputerRow>(rows: T[] | null | undefined): T | undefined {
  if (!rows || rows.length === 0) return undefined;
  const active = rows.filter((r) => r.microvmId);
  const pool = active.length > 0 ? active : [...rows];
  return [...pool].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
}

/** Best-effort duplicate removal after a pick. Deletion is guarded three
 * ways so concurrent invocations converge instead of annihilating:
 * - abort unless the kept row is visible in the fresh list (a keep chosen
 *   from a stale list must never delete what it cannot see),
 * - abort on fewer than 2 rows,
 * - never delete a row holding a microvmId (would orphan a possibly-live,
 *   still-billing VM — those converge via resetStaleRow instead). */
export async function dedupeComputers(ownerId: string, keepId: string): Promise<void> {
  try {
    const { data: rows } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
    const pool = rows ?? [];
    if (pool.length < 2) return;
    if (!pool.some((r) => r.id === keepId)) return;
    for (const r of pool) {
      if (r.id !== keepId && !r.microvmId) {
        try {
          await dataClient.models.Computer.delete({ id: r.id });
          console.log(`[wayfind-api] deduped empty computer row ${r.id}, kept ${keepId}`);
        } catch {
          // Another invocation won the race - the pick stays valid.
        }
      }
    }
  } catch {
    // Listing failed - proceed with the picked row.
  }
}

/** Clear a row whose VM is gone so the next Start provisions fresh. Logs the
 * observed VM state first: GetMicrovm keeps terminated VMs queryable with
 * stateReason/startedAt/terminatedAt — the only record of why a VM died
 * young (lifetime cap, reclaim, crash). Check CloudWatch for this line. */
export async function resetStaleRow(computerId: string, microvmId?: string | null): Promise<void> {
  if (microvmId) {
    try {
      const res = await microvms.send(new GetMicrovmCommand({ microvmIdentifier: microvmId }));
      const started = res.startedAt?.getTime();
      const ended = res.terminatedAt?.getTime() ?? Date.now();
      const lifetimeMin = started ? Math.round((ended - started) / 60_000) : -1;
      console.log(
        `[wayfind-api] resetStaleRow ${computerId} vm=${microvmId} state=${res.state as string} reason=${res.stateReason ?? "—"} lifetimeMin=${lifetimeMin}`,
      );
    } catch (err) {
      console.log(
        `[wayfind-api] resetStaleRow ${computerId} vm=${microvmId} getFailed=${err instanceof Error ? err.name : String(err)}`,
      );
    }
  }
  await dataClient.models.Computer.update({
    id: computerId,
    provisionStatus: "not_provisioned",
    microvmId: "",
    endpoint: "",
  });
}

export async function findOrCreateComputer(ownerId: string, profileId: string) {
  const { data: existing } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  const picked = pickComputer(existing);
  if (picked) {
    if (existing && existing.length > 1) void dedupeComputers(ownerId, picked.id);
    return picked;
  }
  const { data: created, errors } = await dataClient.models.Computer.create({
    ownerId,
    userProfileId: profileId,
    provisionStatus: "not_provisioned",
    region: env.COMPUTER_REGION ?? "ap-southeast-1",
    requestedAt: new Date().toISOString(),
  });
  if (errors || !created) throw new Error(`computer create failed: ${JSON.stringify(errors)}`);
  return created;
}

/** Resume path shared by POST /computer/action and /routines/fire:
 * ResumeMicrovm + wait + heal the row. Returns the live endpoint. */
export async function resumeComputer(computerId: string, microvmId: string): Promise<string> {
  await microvms.send(new ResumeMicrovmCommand({ microvmIdentifier: microvmId }));
  const endpoint = await waitForRunning(microvmId);
  await dataClient.models.Computer.update({ id: computerId, provisionStatus: "running", endpoint });
  return endpoint;
}

/** Full provision chain (boot + identity + smoke test). Throws on any step. */
export async function provisionComputer(computerId: string, ownerId: string): Promise<void> {
  const imageArn = env.COMPUTER_IMAGE_ARN;
  if (!imageArn) throw new Error("COMPUTER_IMAGE_ARN is not configured");
  const bucket = env.COMPUTER_WORKSPACE_BUCKET ?? "";
  const prefix = `computers/${computerId}/workspace/`;

  await dataClient.models.Computer.update({ id: computerId, provisionStatus: "provisioning" });
  // RunMicrovm may succeed before a later step (hooks, smoke test) fails —
  // track it so the catch block can terminate the orphan instead of leaking
  // an alive, billing, untracked VM.
  let bootedMicrovmId: string | undefined;
  try {
    const run = await microvms.send(
      new RunMicrovmCommand({
        imageIdentifier: imageArn,
        runHookPayload: JSON.stringify({ ownerId, computerId }),
        ingressNetworkConnectors: [
          `arn:aws:lambda:${env.COMPUTER_REGION ?? "ap-southeast-1"}:aws:network-connector:aws-network-connector:ALL_INGRESS`,
        ],
        egressNetworkConnectors: [
          `arn:aws:lambda:${env.COMPUTER_REGION ?? "ap-southeast-1"}:aws:network-connector:aws-network-connector:INTERNET_EGRESS`,
        ],
        // Generous lifetimes for a dev computer: suspend after 15m idle, but
        // a suspended VM survives 7d (observed: the old 300s value had the
        // service terminate VMs ~5m after suspend). Absolute cap is 8h
        // (service max for maximumDurationInSeconds) - the workspace restores
        // from S3 on the next provision, so expiry is friction, not loss.
        idlePolicy: { autoResumeEnabled: true, maxIdleDurationSeconds: 900, suspendedDurationSeconds: 604_800 },
        maximumDurationInSeconds: 28_800,
      }),
    );
    if (!run.microvmId) throw new Error("run-microvm returned no microvmId");
    bootedMicrovmId = run.microvmId;
    const endpoint = await waitForRunning(run.microvmId);
    const token = await mintVmToken(run.microvmId);

    // Identity + secrets (Amplify secrets, never stored in the DB).
    // Plus the per-computer usage token: minted here, stored on the row,
    // injected into the VM — the VM reports metered calls with it since it
    // holds no Cognito identity of its own. apiUrl lets the VM reach this
    // API (usage + presigned sync) without the backend knowing its own URL.
    const modalKey = env.MODAL_API_KEY;
    const metaKey = env.PROVIDER_API_KEY;
    if (!modalKey || !metaKey) throw new Error("provider API keys are not configured (Amplify secrets)");
    const usageToken = randomUUID();
    await dataClient.models.Computer.update({ id: computerId, usageToken });
    const computerApi = (env.COMPUTER_API_URL ?? "").replace(/\/+$/, "");
    const runRes = await vmFetch(endpoint, token, "/hooks/run", {
      ownerId,
      computerId,
      secrets: { MODAL_API_KEY: modalKey, PROVIDER_API_KEY: metaKey },
      usageToken,
      ...(computerApi ? { apiUrl: computerApi } : {}),
      ...(bucket ? { workspace: { bucket, prefix } } : {}),
    });
    if (!runRes.ok) throw new Error(`/hooks/run → ${runRes.status}: ${(await runRes.text()).slice(0, 200)}`);

    // Smoke test: one chat turn through the new VM.
    const taskRes = await vmFetch(endpoint, token, "/task", {
      text: "Reply with exactly: cloud-ok",
      ownerId,
      ...(computerApi ? { apiUrl: computerApi } : {}),
    });
    if (!taskRes.ok) throw new Error(`/task smoke → ${taskRes.status}`);
    const { runId } = (await taskRes.json()) as { runId?: string };
    if (!runId) throw new Error("smoke task returned no runId");
    const stream = await fetch(`https://${endpoint}/stream/${runId}`, {
      headers: { "X-aws-proxy-auth": token, Accept: "text/event-stream" },
    });
    const sse = await stream.text();
    if (!sse.includes("cloud-ok")) throw new Error("smoke chat did not return cloud-ok");

    await dataClient.models.Computer.update({
      id: computerId,
      provisionStatus: "running",
      microvmId: run.microvmId,
      endpoint,
      imageVersion: "1.0",
      decidedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Never poison the row: a mid-provision failure means "try again", not
    // "dead". Marking "terminated" used to skip the vmAlive self-heal on the
    // next boot and orphan the VM that just started (alive, billing, but
    // untracked since microvmId is only stored on success).
    if (bootedMicrovmId) {
      try {
        await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: bootedMicrovmId }));
        console.log(`[wayfind-api] terminated ${bootedMicrovmId} after failed provision of ${computerId}`);
      } catch (termErr) {
        console.error(
          `[wayfind-api] LEAKED microvm ${bootedMicrovmId} (provision of ${computerId} failed, terminate failed):`,
          termErr instanceof Error ? termErr.message : String(termErr),
        );
      }
    }
    await dataClient.models.Computer.update({
      id: computerId,
      provisionStatus: "not_provisioned",
    });
    throw err;
  }
}
