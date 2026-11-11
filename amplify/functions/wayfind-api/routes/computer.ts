import { CreateMicrovmAuthTokenCommand, SuspendMicrovmCommand, TerminateMicrovmCommand } from "@aws-sdk/client-lambda-microvms";
import { CORS, json } from "../lib/respond.js";
import { dataClient, microvms } from "../lib/clients.js";
import { ensureProfile } from "../lib/auth.js";
import {
  dedupeComputers,
  findOrCreateComputer,
  mintVmToken,
  pickComputer,
  provisionComputer,
  resetStaleRow,
  resumeComputer,
  vmAlive,
  vmFetch,
} from "../lib/microvm.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /computer/request - get-or-create the caller's Computer row.
// No approval gate: any signed-in user may provision (gatekeeper removed).
export async function handleComputerRequest(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/computer/request") || method !== "POST") return null;
  const profile = await ensureProfile(claims!);
  const { data: existing } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  let computer = pickComputer(existing);
  if (!computer) {
    const { data: created, errors } = await dataClient.models.Computer.create({
      ownerId,
      userProfileId: profile.id,
      provisionStatus: "not_provisioned",
      region: "ap-southeast-1",
      requestedAt: new Date().toISOString(),
    });
    if (errors || !created) {
      return json(500, { error: `computer create failed: ${JSON.stringify(errors)}` });
    }
    computer = created;
  }
  if (computer) void dedupeComputers(ownerId, computer.id);
  return json(200, { data: computer });
}

// POST /computer/provision - boot the caller's VM (idempotent).
// Returns the Computer row immediately; the footer polls provisionStatus.
// Awaited inline (boot ~11s + hooks + smoke < 60s, fits the 300s budget).
export async function handleComputerProvision(ctx: Ctx): Promise<RouteResult> {
  const { method, path, ownerId, claims } = ctx;
  if (!path.endsWith("/computer/provision") || method !== "POST") return null;
  const profile = await ensureProfile(claims!);
  let computer = await findOrCreateComputer(ownerId, profile.id);
  // Self-heal any row holding a MicroVM, whatever its status label says
  // (a stale label must never route a live VM to a fresh provision):
  // gone VM → clear and fall through to boot; live VM with a stale
  // label (e.g. poisoned "terminated") → relabel suspended so the
  // resume path owns it.
  if (computer.microvmId) {
    try {
      if (!(await vmAlive(computer.microvmId))) {
        await resetStaleRow(computer.id, computer.microvmId);
        computer = { ...computer, provisionStatus: "not_provisioned", microvmId: "" };
      } else if (
        computer.provisionStatus !== "running" &&
        computer.provisionStatus !== "suspended" &&
        computer.provisionStatus !== "provisioning"
      ) {
        await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "suspended" });
        computer = { ...computer, provisionStatus: "suspended" };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json(502, { error: `computer state check failed: ${msg.slice(0, 200)}` });
    }
  }
  if (computer.provisionStatus === "running") return json(200, { data: computer });
  if (computer.provisionStatus === "provisioning") return json(202, { data: computer });
  if (computer.provisionStatus === "suspended") {
    return json(409, { error: "computer is suspended - use POST /computer/action {resume}", data: computer });
  }
  // Converge leftover duplicate rows: dead VMs get cleared (later
  // dedupe removes the husk); live ones are left alone, never deleted.
  try {
    const { data: all } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
    for (const r of all ?? []) {
      if (r.id === computer.id || !r.microvmId) continue;
      try {
        if (!(await vmAlive(r.microvmId))) {
          await resetStaleRow(r.id, r.microvmId);
          console.log(`[wayfind-api] cleared stale computer row ${r.id}`);
        }
      } catch {
        // Per-row check failed - leave it for the next call.
      }
    }
  } catch {
    // Listing failed - provision the picked row anyway.
  }
  try {
    await provisionComputer(computer.id, ownerId);
    const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
    return json(200, { data: updated ?? computer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wayfind-api] provision failed:", msg);
    return json(502, { error: `provision failed: ${msg.slice(0, 300)}` });
  }
}

// POST /computer/action {suspend|resume|terminate} - caller's own VM only.
export async function handleComputerAction(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path, ownerId } = ctx;
  if (!path.endsWith("/computer/action") || method !== "POST") return null;
  let body: { action?: string } = {};
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId });
  const computer = pickComputer(computers);
  if (computer && computers && computers.length > 1) void dedupeComputers(ownerId, computer.id);
  if (!computer?.microvmId) return json(404, { error: "no provisioned MicroVM for this account" });
  const microvmId = computer.microvmId;
  // The VM may be gone (suspend-window expiry, out-of-band delete) while
  // the row still claims it. Terminate heals silently; resume/suspend say so.
  if (!(await vmAlive(microvmId))) {
    await resetStaleRow(computer.id, microvmId);
    if (body.action === "terminate") {
      const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
      return json(200, { data: updated });
    }
    return json(410, { error: "that MicroVM no longer exists - press Start computer for a fresh one" });
  }
  try {
    if (body.action === "suspend") {
      // Best-effort workspace flush before suspend.
      try {
        const token = await mintVmToken(microvmId, 5);
        await vmFetch(computer.endpoint ?? "", token, "/hooks/suspend", {});
      } catch {
        // VM may already be unreachable - suspend anyway.
      }
      await microvms.send(new SuspendMicrovmCommand({ microvmIdentifier: microvmId }));
      const { data: updated } = await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "suspended" });
      return json(200, { data: updated });
    }
    if (body.action === "resume") {
      const endpoint = await resumeComputer(computer.id, microvmId);
      const { data: updated } = await dataClient.models.Computer.get({ id: computer.id });
      return json(200, { data: updated ?? { ...computer, provisionStatus: "running", endpoint } });
    }
    if (body.action === "terminate") {
      await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }));
      const { data: updated } = await dataClient.models.Computer.update({ id: computer.id, provisionStatus: "terminated", microvmId: "" });
      return json(200, { data: updated });
    }
    return json(400, { error: "action must be suspend, resume, or terminate" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wayfind-api] computer action failed:", msg);
    return json(502, { error: `action failed: ${msg.slice(0, 300)}` });
  }
}
