/**
 * Time handling for the whole app. Every date the product shows or compares is in Asia/Karachi
 * (PKT, UTC+05:00, no daylight saving). Instants are stored as UTC timestamptz; only input and
 * display convert. Pure functions only, so they run on the server, in the browser and in tests.
 */
export const APP_TZ = "Asia/Karachi";
const PKT_OFFSET = "+05:00";
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDateString = (v: string) => DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
export const isTimeString = (v: string) => TIME_RE.test(v);

/** "2030-01-01" + "17:00" entered in Karachi -> the UTC instant as an ISO string. Throws on invalid input. */
export function karachiToIso(date: string, time: string): string {
  if (!isDateString(date) || !isTimeString(time)) throw new Error("Invalid date or time");
  return new Date(`${date}T${time}:00${PKT_OFFSET}`).toISOString();
}

/** The Karachi calendar date (YYYY-MM-DD) of an instant. */
export function pktDate(at: Date | string | number = new Date()): string {
  return new Date(new Date(at).getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Karachi wall-clock time (HH:mm) of an instant. */
export function pktTime(at: Date | string | number): string {
  return new Date(new Date(at).getTime() + PKT_OFFSET_MS).toISOString().slice(11, 16);
}

/** Split an instant into the two values an <input type="date"> / <input type="time"> pair needs. */
export function toPktInputs(at: Date | string | number): { date: string; time: string } {
  return { date: pktDate(at), time: pktTime(at) };
}

/** [start, end) of a Karachi calendar day as UTC ISO strings. */
export function pktDayRange(date: string): { start: string; end: string } {
  if (!isDateString(date)) throw new Error("Invalid date");
  const start = new Date(`${date}T00:00:00${PKT_OFFSET}`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every calendar date from..to inclusive (capped, so a bad range can never explode a request). */
export function datesBetween(from: string, to: string, cap = 366): string[] {
  if (!isDateString(from) || !isDateString(to) || to < from) return [];
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, ...opts });
const dateTimeFmt = dtf({ day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
const dateFmt = dtf({ day: "2-digit", month: "short", year: "numeric" });
const longDateFmt = dtf({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeOnlyFmt = dtf({ hour: "2-digit", minute: "2-digit", hour12: true });

/** "01 Jan 2030, 05:00 pm PKT" */
export const formatPkt = (at: Date | string | number) => `${dateTimeFmt.format(new Date(at))} PKT`;
export const formatPktDate = (at: Date | string | number) => dateFmt.format(new Date(at));
export const formatPktTime = (at: Date | string | number) => timeOnlyFmt.format(new Date(at));
/** A plain YYYY-MM-DD (already a Karachi calendar date) as "Wednesday, 1 January 2030". */
export const formatLongDate = (date: string) => longDateFmt.format(new Date(`${date}T12:00:00${PKT_OFFSET}`));
export const formatShortDate = (date: string) => dateFmt.format(new Date(`${date}T12:00:00${PKT_OFFSET}`));

/** "2d 03h 05m", "3h 05m 09s", "42s" – for countdowns. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p2(h)}h ${p2(m)}m`;
  if (h > 0) return `${h}h ${p2(m)}m ${p2(sec)}s`;
  if (m > 0) return `${m}m ${p2(sec)}s`;
  return `${sec}s`;
}
