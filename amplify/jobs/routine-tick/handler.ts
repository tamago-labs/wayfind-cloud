import type { EventBridgeHandler } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/routine-tick";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env as any);
Amplify.configure(resourceConfig, libraryOptions);
const dataClient = generateClient<Schema>();

/** 30-minute sweeper: find due routines and hand each to wayfind-api's
 * /routines/fire (which does auth, resume, nextRunAt advance, and the
 * actual /task post). Fire-and-continue — one bad routine never blocks
 * the rest. TICK_SECRET is shared with wayfind-api via Amplify secrets. */
export const handler: EventBridgeHandler<"Scheduled Event", null, void> = async () => {
  const now = new Date().toISOString();
  let due: Array<{ id: string }> = [];
  try {
    // Key-condition on the (status, nextRunAt) GSI — cheaper than a filter
    // and immune to filter/limit pagination quirks as the table grows.
    const res = await dataClient.models.Routine.routinesDue(
      { status: "active", nextRunAt: { le: now } },
      { limit: 25 },
    );
    due = (res.data ?? []).map((r) => ({ id: r.id }));
  } catch (err) {
    console.error("[routine-tick] due query failed:", err instanceof Error ? err.message : err);
    return;
  }
  if (due.length === 0) {
    // Heartbeat: an idle tick is otherwise indistinguishable from a dead
    // schedule in CloudWatch (START/END with no output).
    console.log(`[routine-tick] tick now=${now} due=0`);
    return;
  }
  if (!env.TICK_SECRET) {
    console.error("[routine-tick] TICK_SECRET is not configured — fire calls will 401 until the secret is set");
    return;
  }
  const base = (env.COMPUTER_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    console.error("[routine-tick] COMPUTER_API_URL is not configured");
    return;
  }
  let fired = 0;
  for (const r of due) {
    try {
      const res = await fetch(`${base}/routines/fire`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tick-Secret": env.TICK_SECRET ?? "" },
        body: JSON.stringify({ routineId: r.id }),
      });
      if (res.ok) fired++;
      else console.error(`[routine-tick] fire ${r.id} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      console.error(`[routine-tick] fire ${r.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[routine-tick] due=${due.length} fired=${fired}`);
};
