/**
 * The rows that pass and were shown before, plus up to `step` rows that were not, in list
 * order. A long table then shows rows that start to pass a step at a time, while rows already
 * on show stay put (FR-101 AC-4).
 */
export function reveal<Row>(
	passing: readonly Row[],
	before: ReadonlySet<Row>,
	step: number
): Set<Row> {
	const next = new Set<Row>();
	let added = 0;
	for (const item of passing) {
		if (before.has(item)) next.add(item);
		else if (added < step) {
			next.add(item);
			added += 1;
		}
	}
	return next;
}
