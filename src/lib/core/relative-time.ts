// "Updated" times in record lists (design 13.3): a relative time on screen, the full date in the
// `<time>` element. Computed when rendered; nothing ticks, so the page stays idle (NFR-005).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dateOnly = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "just now", "5 minutes ago", "yesterday", then the date from a week on ("12 Nov 2026"). */
export function relativeTime(then: number, now: number): string {
	const elapsed = Math.max(0, now - then);
	if (elapsed < MINUTE) return 'just now';
	if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
	if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
	if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), 'day');
	return dateOnly.format(then);
}

/** "20 Nov 2026, 14:02" in local time. */
export function fullDateTime(time: number): string {
	return full.format(time);
}
