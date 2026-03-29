/**
 * Normalize a date value that may come back from superjson as a Date object
 * or from raw JSON as a string. Returns a proper Date at midnight local time.
 */
export function toSafeDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  // If it's a string like "2026-03-29", parse as local midnight
  return new Date(d + "T00:00:00");
}

/**
 * Format a date for display, handling both Date objects and strings.
 */
export function formatDate(d: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const date = toSafeDate(d);
  return date.toLocaleDateString("en-US", options);
}

/**
 * Format a date as YYYY-MM-DD string for API calls.
 */
export function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a 24-hour time string ("HH:MM") to 12-hour AM/PM format.
 * Uses the client's local timezone context.
 */
export function formatTimeDisplay(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}
