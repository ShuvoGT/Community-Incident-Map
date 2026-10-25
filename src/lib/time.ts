// Occurrence dates/times and the hotspot window are all reckoned in
// Asia/Dhaka, which is a fixed UTC+6 with no daylight saving. System
// timestamps elsewhere stay UTC.

export const DHAKA_OFFSET_MINUTES = 6 * 60;

export type TimeBand =
  | "band_0_6"
  | "band_6_12"
  | "band_12_18"
  | "band_18_24"
  | "unknown";

function dhakaParts(date: Date): { y: number; m: number; d: number } {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MINUTES * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
  };
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Today's calendar date in Dhaka, as YYYY-MM-DD.
export function dhakaToday(now: Date = new Date()): string {
  const { y, m, d } = dhakaParts(now);
  return iso(y, m, d);
}

// The seven Dhaka calendar dates ending today (today is the last, partial day).
export function sevenDayWindow(now: Date = new Date()): {
  start: string;
  end: string;
  dates: string[];
} {
  const { y, m, d } = dhakaParts(now);
  const end = Date.UTC(y, m - 1, d);
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000);
    dates.push(
      iso(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()),
    );
  }
  return { start: dates[0], end: dates[dates.length - 1], dates };
}

// A date (YYYY-MM-DD) is in the future if it is after today in Dhaka.
export function isFutureDhakaDate(date: string, now: Date = new Date()): boolean {
  return date > dhakaToday(now);
}

// Map a local HH:MM(:SS) time to its publication band. Unknown time stays
// "unknown" — never fabricate midnight.
export function timeBandFromLocalTime(time: string | null | undefined): TimeBand {
  if (!time) return "unknown";
  const hour = Number(time.slice(0, 2));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "unknown";
  if (hour < 6) return "band_0_6";
  if (hour < 12) return "band_6_12";
  if (hour < 18) return "band_12_18";
  return "band_18_24";
}
