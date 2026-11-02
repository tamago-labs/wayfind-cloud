import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const dataClient = generateClient<Schema>();

export interface RoutineItem {
  id: string;
  botId?: string;
  name?: string;
  prompt: string;
  kind: 'once' | 'cron';
  cron?: string;
  runAt?: string;
  timezone?: string;
  status: 'active' | 'paused' | 'done';
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: string;
  runCount?: number;
}

/** Routines for one bot (owner-scoped query, client-filtered by botId).
 * Rows for other bots are flagged (never hidden) so the UI can explain
 * instead of showing a bare empty state. */
export async function listBotRoutines(ownerId: string, botId: string): Promise<Array<RoutineItem & { _otherBot?: boolean }>> {
  const { data } = await dataClient.models.Routine.routinesByOwnerId({ ownerId });
  return (data ?? [])
    .map((r) => ({ ...toItem(r), _otherBot: r.botId !== botId }))
    .sort((a, b) => Number(a._otherBot ?? false) - Number(b._otherBot ?? false) || byNext(a, b));
}

function toItem(r: {
  id: string; botId?: string | null; name?: string | null; prompt?: string | null; kind?: string | null;
  cron?: string | null; runAt?: string | null; timezone?: string | null;
  status?: string | null; nextRunAt?: string | null; lastRunAt?: string | null;
  lastStatus?: string | null; runCount?: number | null;
}): RoutineItem {
  return {
    id: r.id,
    ...(r.botId ? { botId: r.botId } : {}),
    ...(r.name ? { name: r.name } : {}),
    prompt: r.prompt ?? '',
    kind: (r.kind ?? 'once') as 'once' | 'cron',
    ...(r.cron ? { cron: r.cron } : {}),
    ...(r.runAt ? { runAt: r.runAt } : {}),
    ...(r.timezone ? { timezone: r.timezone } : {}),
    status: (r.status ?? 'active') as 'active' | 'paused' | 'done',
    ...(r.nextRunAt ? { nextRunAt: r.nextRunAt } : {}),
    ...(r.lastRunAt ? { lastRunAt: r.lastRunAt } : {}),
    ...(r.lastStatus ? { lastStatus: r.lastStatus } : {}),
    ...(typeof r.runCount === 'number' ? { runCount: r.runCount } : {}),
  };
}

function byNext(a: RoutineItem, b: RoutineItem): number {
  return (a.nextRunAt ?? '').localeCompare(b.nextRunAt ?? '');
}

/** Pause or resume a routine. */
export async function setRoutineStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const { errors } = await dataClient.models.Routine.update({ id, status });
  if (errors?.length) throw new Error(`routine update failed: ${JSON.stringify(errors)}`);
}

/** Delete a routine. Fired runs already in flight still complete. */
export async function deleteRoutine(id: string): Promise<void> {
  const { errors } = await dataClient.models.Routine.delete({ id });
  if (errors?.length) throw new Error(`routine delete failed: ${JSON.stringify(errors)}`);
}
