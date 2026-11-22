export type AICategory = "ROADS" | "STREETLIGHTS" | "WATER" | "WASTE" | "OTHER";

export type AIPriority = "LOW" | "MEDIUM" | "HIGH";

export type AIProviderName = "local" | "openai" | "gemini";

export type AIAttributionProvider = AIProviderName | "local-fallback";

export type AITask = "categorize" | "prioritize" | "summarize" | "triage";

export type AIAttribution = {
	provider: AIAttributionProvider;
	degraded: boolean;
	reason?: string;
	cached: boolean;
	usage: {
		usedToday: number;
		limit: number;
		remaining: number;
	};
};

export type CorpusIssue = {
	id: string;
	title: string;
	description: string;
	category: AICategory;
	location: string;
	status: string;
	createdAt: Date;
};

export type CategorySuggestion = {
	category: AICategory;
	confidence: number;
	alternatives: Array<{ category: AICategory; score: number }>;
	keywords: string[];
	rationale: string;
};

export type PrioritySuggestion = {
	priority: AIPriority;
	urgencyScore: number;
	confidence: number;
	reasons: string[];
};

export type SummarySuggestion = {
	summary: string;
	keyPoints: string[];
};

export type SimilarIssue = {
	id: string;
	title: string;
	category: AICategory;
	status: string;
	location: string;
	similarity: number;
};

export type AssigneeRecommendation = {
	id: string;
	name: string;
	score: number;
	reason: string;
	activeCount: number;
};

export type SuggestedAction = {
	type: "SET_CATEGORY" | "SET_PRIORITY" | "ASSIGN" | "ADD_NOTE";
	value: string;
	reason: string;
};

export type TriageSuggestion = {
	category: CategorySuggestion;
	priority: PrioritySuggestion;
	summary: SummarySuggestion;
	duplicates: SimilarIssue[];
	actions: SuggestedAction[];
	confidence: number;
	rationale: string;
};

export type Capability = {
	task: string;
	name: string;
	description: string;
	advanced: boolean;
};

export const AI_CAPABILITIES: Capability[] = [
	{
		task: "categorize",
		name: "Smart categorization",
		description:
			"Suggests the most likely issue category from the report text using weighted keyword signals.",
		advanced: false,
	},
	{
		task: "prioritize",
		name: "Urgency scoring",
		description:
			"Ranks urgency and suggests a priority with human-readable reasons.",
		advanced: false,
	},
	{
		task: "summarize",
		name: "Report summarization",
		description:
			"Produces a concise summary and key points from a report and its status history.",
		advanced: false,
	},
	{
		task: "duplicates",
		name: "Duplicate detection",
		description:
			"Finds near-duplicate reports with TF-IDF vector cosine similarity.",
		advanced: false,
	},
	{
		task: "recommend-assignee",
		name: "Assignee recommendation",
		description:
			"Ranks personnel by category expertise, text similarity and current workload.",
		advanced: false,
	},
	{
		task: "search",
		name: "Semantic issue search",
		description:
			"Searches the issue corpus by vector similarity instead of exact keyword matches.",
		advanced: true,
	},
	{
		task: "triage",
		name: "Structured triage workflow",
		description:
			"Runs categorization, urgency scoring, summarization and duplicate checks, then returns validated suggested actions.",
		advanced: true,
	},
];
