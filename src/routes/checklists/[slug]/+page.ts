import { error } from '@sveltejs/kit';
import { CHECKLISTS } from '#lib/content/checklists/index.ts';
import type { EntryGenerator, PageLoad } from './$types';

// One prerendered page per checklist (NFR-022); any other slug is a 404.
export const entries: EntryGenerator = () => CHECKLISTS.map(({ slug }) => ({ slug }));

export const load: PageLoad = ({ params }) => {
	const checklist = CHECKLISTS.find(({ slug }) => slug === params.slug);
	if (!checklist) error(404, 'Not found');
	return { checklist };
};
