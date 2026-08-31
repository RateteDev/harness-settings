const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
/** ISO 8601 date, optionally followed by the time and offset of that instant. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2}))?$/;

/**
 * Formats an ISO 8601 instant ("2026-05-31T21:00:00+09:00") as "2026/05/31(日)".
 *
 * The calendar day shown is the one written in the value's own offset, so the
 * date part is taken textually and the weekday derived via `Date.UTC`. Pages are
 * prerendered on CI runners and build workers whose host timezone is UTC; going
 * through an instant and local-time getters there would shift dates one day back.
 * Returns the input unchanged when it is not an ISO 8601 date.
 */
export function formatDateJa(iso: string): string {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) {
    return iso;
  }
  const [, year, month, day] = match;
  const weekday =
    WEEKDAYS[new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()];
  return `${year}/${month}/${day}(${weekday})`;
}
