import { dataClient, env } from "../lib/clients.js";
import { json } from "../lib/respond.js";
import { verifyToken } from "../lib/auth.js";
import { stampOwner } from "../lib/owner.js";
import {
  mintVmToken,
  pickComputer,
  resetStaleRow,
  resumeComputer,
  vmAlive,
  vmFetch,
} from "../lib/microvm.js";
import { nextCronRun, zonedWallToUtc } from "../lib/schedule.js";
import type { Ctx, RouteResult } from "../lib/ctx.js";

// POST /routines - create a scheduled routine (chat-created via the
// schedule_task agent tool). Dual auth like /runs/:id/usage: a user bearer
// attributes to the verified caller; otherwise the per-computer usage
// token + claimed ownerId attributes to that computer's owner. The bot is
// ownership-checked. Body: { ownerId?, botId, name?, prompt,
// kind: 'once'|'cron', runAt?, cron?, timezone? }.
export async function handleRoutinesCreate(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!/\/routines$/.test(path) || method !== "POST") return null;
  let schedOwner: string | null = null;
  const schedAuth = event.headers.authorization ?? event.headers.Authorization;
  if (schedAuth?.startsWith("Bearer ")) {
    try {
      schedOwner = (await verifyToken(schedAuth)).sub;
    } catch {
      // Fall through to usage-token auth.
    }
  }
  let schedBody: {
    ownerId?: string;
    botId?: string;
    name?: string;
    prompt?: string;
    kind?: string;
    runAt?: string;
    cron?: string;
    timezone?: string;
  } = {};
  try {
    schedBody = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (!schedOwner) {
    const usageToken =
      event.headers["x-computer-usage-token"] ??
      event.headers["X-computer-usage-token"] ??
      event.headers["X-Computer-Usage-Token"];
    const claimedOwner = typeof schedBody.ownerId === "string" ? schedBody.ownerId : "";
    if (!usageToken || !claimedOwner) {
      return json(401, { error: "unauthorized: no bearer or usage token" });
    }
    const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId: claimedOwner });
    const match = (computers ?? []).find((c) => c.usageToken && c.usageToken === usageToken);
    if (!match) return json(401, { error: "unauthorized: bad usage token" });
    schedOwner = claimedOwner;
  }
  const botId = typeof schedBody.botId === "string" ? schedBody.botId : "";
  const prompt = typeof schedBody.prompt === "string" ? schedBody.prompt.slice(0, 2000).trim() : "";
  const kind = schedBody.kind;
  const timezone = typeof schedBody.timezone === "string" && schedBody.timezone ? schedBody.timezone : "UTC";
  try {
    // Throws on unknown IANA zones — validate up front so kind=once rows
    // can't store a timezone the ticker/display can't use.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return json(400, { error: `unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok` });
  }
  if (!botId) return json(400, { error: "botId is required" });
  if (!prompt) return json(400, { error: "prompt is required" });
  if (kind !== "once" && kind !== "cron") return json(400, { error: "kind must be 'once' or 'cron'" });
  const { data: bot } = await dataClient.models.Bot.get({ id: botId });
  if (!bot) return json(404, { error: "unknown bot" });
  if (bot.ownerId !== schedOwner) return json(403, { error: "bot belongs to a different owner" });
  let nextRunAt: string;
  let runAt: string | undefined;
  let cron: string | undefined;
  if (kind === "once") {
    if (typeof schedBody.runAt !== "string" || !schedBody.runAt) {
      return json(400, { error: "runAt ISO time is required for kind=once" });
    }
    // Offset-less datetimes are wall time in the routine's timezone
    // (models often emit the local clock without an offset); only explicit
    // offsets/Z are read as absolute instants.
    let at: Date;
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(schedBody.runAt.trim())) {
      at = new Date(schedBody.runAt);
      if (Number.isNaN(at.getTime())) return json(400, { error: "runAt is not a valid date" });
    } else {
      try {
        at = zonedWallToUtc(schedBody.runAt, timezone);
      } catch (err) {
        return json(400, { error: err instanceof Error ? err.message : "bad runAt/timezone" });
      }
    }
    if (at.getTime() < Date.now() + 60_000) {
      return json(400, { error: "runAt must be at least a minute in the future" });
    }
    runAt = at.toISOString();
    nextRunAt = runAt;
  } else {
    if (typeof schedBody.cron !== "string" || !schedBody.cron.trim()) {
      return json(400, { error: "cron is required for kind=cron" });
    }
    cron = schedBody.cron.trim();
    try {
      nextRunAt = nextCronRun(cron, timezone);
    } catch (err) {
      return json(400, { error: err instanceof Error ? err.message : "bad cron/timezone" });
    }
  }
  const { data: routine, errors } = await dataClient.models.Routine.create({
    ownerId: schedOwner,
    botId,
    ...(typeof schedBody.name === "string" && schedBody.name.trim()
      ? { name: schedBody.name.trim().slice(0, 80) }
      : {}),
    prompt,
    kind,
    ...(cron ? { cron } : {}),
    ...(runAt ? { runAt } : {}),
    timezone,
    status: "active",
    nextRunAt,
    runCount: 0,
  });
  if (errors || !routine) {
    return json(500, { error: `routine create failed: ${JSON.stringify(errors)}` });
  }
  try {
    await stampOwner("Routine", routine.id, schedOwner);
  } catch (err) {
    // No invisible orphans: roll the row back when the owner stamp fails.
    try {
      await dataClient.models.Routine.delete({ id: routine.id });
    } catch {
      // Best-effort rollback.
    }
    return json(500, { error: `routine owner stamp failed: ${err instanceof Error ? err.message : err}` });
  }
  return json(200, {
    ok: true,
    routine: { id: routine.id, kind, nextRunAt, timezone, status: "active" },
  });
}

/** Shared fire implementation behind /routines/fire (30-minute ticker).
 * Advances nextRunAt FIRST (no double-fire), resumes a suspended computer
 * (never provisions — a dead VM marks the run skipped-no-computer), then
 * POSTs the stored prompt to the VM as the bot. Output lands in the bot's
 * thread (conversationId = botId). Returns the HTTP status + body the route
 * should reply with. */
async function fireRoutine(routineId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const record = async (id: string, status: string, runCount?: number) => {
    try {
      const cur = await dataClient.models.Routine.get({ id });
      await dataClient.models.Routine.update({
        id,
        lastRunAt: new Date().toISOString(),
        lastStatus: status,
        runCount: (runCount ?? cur.data?.runCount ?? 0) + 1,
      });
    } catch {
      // Best-effort bookkeeping — the fire result is already decided.
    }
  };
  const { data: routine } = await dataClient.models.Routine.get({ id: routineId });
  if (!routine) return { status: 404, body: { error: "unknown routine" } };
  if (routine.status !== "active") return { status: 200, body: { ok: true, skipped: `status=${routine.status}` } };
  // Advance before firing so a crash/retry never double-runs.
  if (routine.kind === "once") {
    await dataClient.models.Routine.update({ id: routine.id, status: "done" });
  } else {
    if (!routine.cron) {
      await record(routine.id, "bad-cron: missing expression", routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "bad-cron" } };
    }
    try {
      const next = nextCronRun(routine.cron, routine.timezone ?? "UTC");
      await dataClient.models.Routine.update({ id: routine.id, nextRunAt: next });
    } catch (err) {
      await record(routine.id, `bad-cron: ${err instanceof Error ? err.message : err}`, routine.runCount ?? 0);
      return { status: 200, body: { ok: true, skipped: "bad-cron" } };
    }
  }
  const { data: bot } = routine.botId
    ? await dataClient.models.Bot.get({ id: routine.botId })
    : { data: null };
  if (routine.botId && !bot) {
    await record(routine.id, "skipped-unknown-bot", routine.runCount ?? 0);
    return { status: 200, body: { ok: true, skipped: "unknown-bot" } };
  }
  if (bot && bot.ownerId !== routine.ownerId) {
    await record(routine.id, "skipped-wrong-owner", routine.runCount ?? 0);
    return { status: 200, body: { ok: true, skipped: "wrong-owner" } };
  }
  const { data: computers } = await dataClient.models.Computer.computerByOwnerId({ ownerId: routine.ownerId });
  // Routines run on the classic cloud computer — never the outer sandbox.
  const computer = pickComputer(computers, "classic");
  if (!computer?.microvmId) {
    await record(routine.id, "skipped-no-computer", routine.runCount ?? 0);
    return { status: 200, body: { ok: true, skipped: "no-computer" } };
  }
  const microvmId = computer.microvmId;
  if (!(await vmAlive(microvmId))) {
    await resetStaleRow(computer.id, microvmId);
    await record(routine.id, "skipped-no-vm", routine.runCount ?? 0);
    return { status: 200, body: { ok: true, skipped: "no-vm" } };
  }
  let endpoint = computer.endpoint ?? "";
  if (computer.provisionStatus === "suspended") {
    try {
      endpoint = await resumeComputer(computer.id, microvmId);
    } catch (err) {
        await record(routine.id, `resume-failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`, routine.runCount ?? 0);
        return { status: 502, body: { error: "resume failed" } };
    }
  } else if (computer.provisionStatus !== "running") {
    await record(routine.id, `skipped-${computer.provisionStatus}`, routine.runCount ?? 0);
    return { status: 200, body: { ok: true, skipped: computer.provisionStatus ?? "not-ready" } };
  }
  // Clock line first: the model is otherwise time-blind.
  const tz = routine.timezone ?? "UTC";
  let clockLine: string;
  try {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).format(new Date());
    clockLine = `Current time: ${local} (${tz}).`;
  } catch {
    clockLine = `Current time: ${new Date().toISOString()} (UTC).`;
  }
  const botName = bot?.name ?? "Assistant";
  const system = bot
    ? bot.role
      ? `You are "${botName}". Role: ${bot.role}.`
      : `You are "${botName}". Your role is not defined yet.`
    : `You are "${botName}".`;
  let token: string;
  try {
    token = await mintVmToken(microvmId, 30);
  } catch {
    await record(routine.id, "token-mint-failed", routine.runCount ?? 0);
    return { status: 502, body: { error: "microvm token mint failed" } };
  }
  let upstream: Response;
  try {
    upstream = await vmFetch(endpoint, token, "/task", {
      text: routine.prompt,
      conversationId: routine.botId ?? `routine-${routine.id}`,
      system: `${system}\n${clockLine}`,
      allowedSkills: bot?.skillsEnabled ?? undefined,
      allowedMcp: bot?.mcpEnabled ?? undefined,
      ownerId: routine.ownerId,
      ...(env.COMPUTER_API_URL ? { apiUrl: env.COMPUTER_API_URL } : {}),
    });
  } catch (err) {
    await record(routine.id, `task-post-failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`, routine.runCount ?? 0);
    return { status: 502, body: { error: "computer unreachable" } };
  }
  if (!upstream.ok) {
    await record(routine.id, `task-rejected: ${upstream.status}`, routine.runCount ?? 0);
    return { status: 502, body: { error: `computer rejected task: ${upstream.status}` } };
  }
  let runId: string | undefined;
  try {
    runId = ((await upstream.json()) as { runId?: string }).runId;
  } catch {
    runId = undefined;
  }
  await record(routine.id, "ok", routine.runCount ?? 0);
  return { status: 200, body: { ok: true, runId } };
}

// POST /routines/fire {routineId} — ticker-only entry (X-Tick-Secret must
// match the shared TICK_SECRET).
export async function handleRoutinesFire(ctx: Ctx): Promise<RouteResult> {
  const { event, method, path } = ctx;
  if (!/\/routines\/fire$/.test(path) || method !== "POST") return null;
  const tickSecret =
    event.headers["x-tick-secret"] ??
    event.headers["x-tick-secret"] ??
    event.headers["X-Tick-Secret"];
  if (!env.TICK_SECRET) {
    // Server misconfig — the ticker can never succeed until the secret is
    // set (sandbox secret / branch env). Log loud, fail closed.
    console.error("[routines/fire] TICK_SECRET is not configured");
    return json(401, { error: "unauthorized: bad tick secret" });
  }
  if (tickSecret !== env.TICK_SECRET) {
    return json(401, { error: "unauthorized: bad tick secret" });
  }
  let fireBody: { routineId?: string } = {};
  try {
    fireBody = JSON.parse(event.body ?? "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  if (typeof fireBody.routineId !== "string" || !fireBody.routineId) {
    return json(400, { error: "routineId is required" });
  }
  const out = await fireRoutine(fireBody.routineId);
  return json(out.status, out.body);
}
