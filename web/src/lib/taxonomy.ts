import taxonomy from '../constants/taxonomy.json';

export type Taxonomy = {
	version: string;
	categories: Array<{
		id: string;
		name: string;
		topics: Array<{
			id: string;
			name: string;
			aliases?: string[];
			kbAnchors?: string[];
			subtopics: Array<{ id: string; name: string }>;
		}>;
	}>;
};

export const getTaxonomy = (): Taxonomy => taxonomy as unknown as Taxonomy;

export const listCategoryOptions = () => (taxonomy as any).categories.map((c: any) => ({ value: c.id, label: c.name }));

export const listTopicOptions = (categoryId: string) => {
	const cat = (taxonomy as any).categories.find((c: any) => c.id === categoryId);
	return (cat?.topics || []).map((t: any) => ({ value: t.id, label: t.name }));
};

export const listSubtopicOptions = (topicId: string) => {
	for (const c of (taxonomy as any).categories) {
		const t = c.topics.find((x: any) => x.id === topicId);
		if (t) return (t.subtopics || []).map((s: any) => ({ value: s.id, label: s.name }));
	}
	return [];
};

export const listAllTopicsFlat = () => {
	const out: Array<{ id: string; label: string; categoryId: string }> = [];
	for (const c of (taxonomy as any).categories) {
		for (const t of c.topics) {
			out.push({ id: t.id, label: t.name, categoryId: c.id });
		}
	}
	return out;
}; 