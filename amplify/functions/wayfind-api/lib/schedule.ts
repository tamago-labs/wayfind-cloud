import { CronExpressionParser } from "cron-parser";

// Offset of `timezone` at a UTC instant, in ms (wall − UTC). Used to
// interpret offset-less datetimes as wall time in that zone.
export const tzOffsetMs = (timezone: string, utcMs: number): number => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUTC - utcMs;
};

// Naive "YYYY-MM-DDTHH:mm[:ss]" (no offset/Z) → UTC instant, reading the
// wall clock in `timezone`. Models often emit the local wall time without
// an offset; parsing it as UTC would shift the fire by the zone offset.
// Throws on bad input — callers turn it into a 400 the model can act on.
export const zonedWallToUtc = (naive: string, timezone: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(naive.trim());
  if (!m) throw new Error(`runAt "${naive}" needs a full date-time with an explicit offset, e.g. 2026-11-02T15:28:00+07:00`);
  try {
    // Throws on unknown IANA zones.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok`);
  }
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (Number.isNaN(guess)) throw new Error(`runAt "${naive}" is not a valid date-time`);
  // Two passes so a DST fold between guess and target still converges.
  const instant = guess - tzOffsetMs(timezone, guess);
  return new Date(guess - tzOffsetMs(timezone, instant));
};

// Next cron fire strictly after `from`, in `timezone`. Throws on bad
// cron/timezone — callers turn it into a 400 the model can act on.
export const nextCronRun = (cron: string, timezone: string, from: Date = new Date()): string => {
  try {
    // Throws on unknown IANA zones.
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`unknown timezone "${timezone}" — use IANA, e.g. Asia/Bangkok`);
  }
  try {
    return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toDate().toISOString();
  } catch {
    throw new Error(`invalid cron "${cron}" — use 5-field minute precision, e.g. "0 9 * * 1"`);
  }
};
