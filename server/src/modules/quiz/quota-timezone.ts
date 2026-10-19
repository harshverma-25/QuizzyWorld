/**
 * Quota Timezone Utilities for Indian Standard Time (IST, UTC+5:30)
 * QUIZZY daily quiz generation quotas reset strictly at midnight IST (00:00:00.000 IST).
 */

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // 19,800,000 ms

/**
 * Returns the exact Date corresponding to 00:00:00.000 IST (midnight IST) for the day of `date`.
 * In UTC terms, 00:00:00.000 IST on calendar day D is 18:30:00.000 UTC on day D-1.
 */
export function getStartOfIstDay(date: Date = new Date()): Date {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istTime.getUTCFullYear();
  const month = istTime.getUTCMonth();
  const day = istTime.getUTCDate();
  return new Date(Date.UTC(year, month, day) - IST_OFFSET_MS);
}

/**
 * Returns the exact Date corresponding to the NEXT midnight IST (00:00:00.000 IST of tomorrow).
 */
export function getNextMidnightIst(date: Date = new Date()): Date {
  const istTime = new Date(date.getTime() + IST_OFFSET_MS);
  const year = istTime.getUTCFullYear();
  const month = istTime.getUTCMonth();
  const day = istTime.getUTCDate();
  return new Date(Date.UTC(year, month, day + 1) - IST_OFFSET_MS);
}

/**
 * Checks if two dates fall on different calendar days in IST.
 */
export function isDifferentIstDay(d1: Date, d2: Date): boolean {
  return getStartOfIstDay(d1).getTime() !== getStartOfIstDay(d2).getTime();
}
