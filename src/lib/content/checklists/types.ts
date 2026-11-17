// Checklist content (FR-060, design S-07): read-only reference in Phase 1, written for this
// project and reviewed by the owner before merge (docs/prd.md, Checklists).

export interface ChecklistSection {
	readonly heading: string;
	/** Each item is one testable statement of expected behaviour (FR-060 AC-2). */
	readonly items: readonly string[];
}

export interface Checklist {
	/** Route segment: `/checklists/<slug>`. */
	readonly slug: string;
	readonly title: string;
	/** One line for the list page. */
	readonly summary: string;
	readonly sections: readonly ChecklistSection[];
}
