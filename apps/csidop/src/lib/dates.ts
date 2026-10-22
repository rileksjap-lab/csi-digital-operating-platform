// Calendar-date helpers that don't depend on the server's timezone.
// `new Date(y, m, 1).toISOString().slice(0, 10)` shifts a day early on a +08
// server (local midnight is the previous day in UTC), which silently dropped
// the last day of every month/quarter from reports. These build the ISO
// dates directly instead.

const pad = (n: number) => String(n).padStart(2, "0");

/** First and last day of a month (month is 1-12), as "YYYY-MM-DD". */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

/** First and last day of a quarter (q is 1-4), as "YYYY-MM-DD". */
export function quarterRange(year: number, q: number): { start: string; end: string } {
  const firstMonth = (q - 1) * 3 + 1;
  return {
    start: monthRange(year, firstMonth).start,
    end: monthRange(year, firstMonth + 2).end,
  };
}

/** Today's date in the server's local timezone, as "YYYY-MM-DD". */
export function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Number of Monday-Friday days from startIso to endIso, inclusive. */
export function weekdaysBetween(startIso: string, endIso: string): number {
  const DAY = 86_400_000;
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  let count = 0;
  for (let t = start; t <= end; t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
