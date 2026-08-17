// App-wide policy: all calendar/clock views render in America/New_York,
// regardless of the browser's timezone. This keeps "today" consistent with
// the backend (Django TIME_ZONE) so booking defaults don't roll over a day
// early for users west of NY.

export const APP_TZ = 'America/New_York';

/** YYYY-MM-DD for "today" in NY. */
export function getTodayInNY(): string {
  // en-CA is guaranteed to produce YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date());
}

/** {year, month, day} for "today" in NY. month is 0-indexed to match Date. */
export function getNYYearMonthDay(): { year: number; month: number; day: number } {
  const [y, m, d] = getTodayInNY().split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}
