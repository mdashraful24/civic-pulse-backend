import type {
	AICategory,
	AIPriority,
	CorpusIssue,
	SimilarIssue,
} from "./ai.interface";

const STOP_WORDS = new Set([
	"the",
	"and",
	"for",
	"with",
	"that",
	"this",
	"there",
	"their",
	"have",
	"has",
	"had",
	"was",
	"were",
	"are",
	"is",
	"am",
	"be",
	"been",
	"being",
	"from",
	"into",
	"about",
	"when",
	"where",
	"which",
	"what",
	"who",
	"why",
	"how",
	"not",
	"but",
	"you",
	"your",
	"our",
	"they",
	"them",
	"its",
	"it's",
	"can",
	"could",
	"would",
	"should",
	"will",
	"just",
	"very",
	"really",
	"please",
	"thanks",
	"issue",
	"issues",
	"report",
	"reported",
	"need",
	"needs",
	"needed",
	"there's",
	"here",
	"also",
	"still",
	"since",
	"some",
	"any",
	"all",
	"one",
	"two",
	"out",
	"over",
	"under",
	"after",
	"before",
	"now",
	"today",
	"yesterday",
	"happening",
	"happened",
	"seen",
	"area",
]);

const CATEGORY_SIGNALS: Record<Exclude<AICategory, "OTHER">, string[]> = {
	ROADS: [
		"road",
		"roads",
		"pothole",
		"potholes",
		"pavement",
		"sidewalk",
		"street",
		"traffic",
		"bridge",
		"asphalt",
		"lane",
		"crossing",
		"curb",
		"kerb",
		"speed",
		"hump",
		"crack",
		"damaged",
		"surface",
		"intersection",
	],
	STREETLIGHTS: [
		"light",
		"lights",
		"lamp",
		"lamps",
		"streetlight",
		"streetlights",
		"dark",
		"pole",
		"bulb",
		"bulbs",
		"flickering",
		"flicker",
		"lit",
		"lighting",
		"illumination",
		"electric",
		"electrical",
		"outage",
	],
	WATER: [
		"water",
		"leak",
		"leaking",
		"pipe",
		"pipes",
		"drain",
		"drains",
		"sewage",
		"flood",
		"flooding",
		"gutter",
		"overflow",
		"overflowing",
		"tap",
		"supply",
		"storm",
		"burst",
		"puddle",
		"dirty",
	],
	WASTE: [
		"garbage",
		"trash",
		"waste",
		"bin",
		"bins",
		"rubbish",
		"dump",
		"dumped",
		"litter",
		"collection",
		"recycling",
		"smell",
		"odor",
		"flies",
		"container",
		"debris",
	],
};

const HIGH_URGENCY_SIGNALS = [
	"flood",
	"flooding",
	"fire",
	"danger",
	"dangerous",
	"hazard",
	"hazardous",
	"accident",
	"emergency",
	"urgent",
	"severe",
	"collapsed",
	"exposed",
	"electrocution",
	"gas",
	"blocked",
	"impassable",
	"injured",
	"child",
	"school",
	"hospital",
	"deep",
	"unstable",
	"sparks",
	"live wire",
];

const MEDIUM_URGENCY_SIGNALS = [
	"leak",
	"leaking",
	"broken",
	"outage",
	"dark",
	"missing",
	"overflow",
	"cracked",
	"damaged",
	"stuck",
	"jammed",
	"smell",
	"noise",
	"slow",
	"obstructed",
	"overdue",
	"repeated",
	"several",
	"many",
	"busy",
];

const LOW_URGENCY_SIGNALS = [
	"minor",
	"small",
	"slight",
	"cosmetic",
	"occasional",
	"sometimes",
	"eventually",
	"low",
	"tiny",
	"looks",
	"maybe",
	"perhaps",
];

export type Vector = Map<string, number>;

const countHits = (tokens: string[], signals: string[]): string[] => {
	const hits = new Set<string>();
	for (const signal of signals) {
		const parts = signal.split(" ").filter((part) => part.length > 2);
		const matched =
			parts.length > 1
				? parts.every((part) => tokens.includes(part))
				: tokens.includes(signal);
		if (matched) hits.add(signal);
	}
	return [...hits];
};

export const tokenize = (text: string): string[] =>
	(text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
		(token) => token.length > 2 && !STOP_WORDS.has(token),
	);

export const rankCategories = (
	text: string,
): Array<{ category: AICategory; score: number }> => {
	const tokens = tokenize(text);
	const ranked = Object.entries(CATEGORY_SIGNALS).map(
		([category, signals]) => ({
			category: category as AICategory,
			score: countHits(tokens, signals).length,
		}),
	);

	return ranked.sort((a, b) => b.score - a.score);
};

export const categorizeHeuristic = (
	text: string,
): {
	category: AICategory;
	confidence: number;
	keywords: string[];
	rationale: string;
} => {
	const ranked = rankCategories(text);
	const tokens = tokenize(text);
	const top = ranked[0];
	const total = ranked.reduce((sum, item) => sum + item.score, 0);
	const keywords = tokens
		.filter((token) =>
			Object.values(CATEGORY_SIGNALS).some((signals) =>
				signals.includes(token),
			),
		)
		.filter((token, index, list) => list.indexOf(token) === index)
		.slice(0, 6);

	if (!top || top.score === 0) {
		return {
			category: "OTHER",
			confidence: 0.42,
			keywords,
			rationale:
				"No category-specific signals were found, so the report was placed in OTHER.",
		};
	}

	const confidence = Math.min(
		0.95,
		0.45 + (top.score / Math.max(total, 1)) * 0.5,
	);
	const matched = countHits(
		tokens,
		CATEGORY_SIGNALS[top.category as Exclude<AICategory, "OTHER">],
	);

	return {
		category: top.category,
		confidence: Number(confidence.toFixed(2)),
		keywords,
		rationale:
			matched.length > 0
				? `Matched ${matched.slice(0, 4).join(", ")} for ${top.category}.`
				: `Weighted keyword signals favour ${top.category}.`,
	};
};

export const urgencyHeuristic = (
	text: string,
): {
	priority: AIPriority;
	urgencyScore: number;
	confidence: number;
	reasons: string[];
} => {
	const tokens = tokenize(text);
	const high = countHits(tokens, HIGH_URGENCY_SIGNALS);
	const medium = countHits(tokens, MEDIUM_URGENCY_SIGNALS);
	const low = countHits(tokens, LOW_URGENCY_SIGNALS);
	const hits = high.length + medium.length + low.length;
	const raw = 24 + high.length * 19 + medium.length * 9 - low.length * 7;
	const urgencyScore = Math.max(5, Math.min(100, Math.round(raw)));
	const priority: AIPriority =
		urgencyScore >= 65 ? "HIGH" : urgencyScore >= 35 ? "MEDIUM" : "LOW";
	const reasons = [
		...high.slice(0, 3).map((signal) => `High-impact signal: ${signal}.`),
		...medium
			.slice(0, 2)
			.map((signal) => `Functional impact signal: ${signal}.`),
		...low.slice(0, 1).map((signal) => `Lower-impact signal: ${signal}.`),
	].slice(0, 5);

	return {
		priority,
		urgencyScore,
		confidence: Number(Math.min(0.94, 0.5 + hits * 0.08).toFixed(2)),
		reasons:
			reasons.length > 0
				? reasons
				: ["No explicit urgency signals; defaulted to a moderate score."],
	};
};

export const summarizeHeuristic = (
	text: string,
): { summary: string; keyPoints: string[] } => {
	const sentences = text
		.split(/(?<=[.!?])\s+/)
		.map((sentence) => sentence.trim())
		.filter((sentence) => sentence.length > 12);

	if (sentences.length === 0) {
		const fallback = text.trim().replace(/\s+/g, " ");
		const short = fallback.slice(0, 240).trim();
		return {
			summary: short.length < fallback.length ? `${short}…` : short,
			keyPoints: [],
		};
	}

	const tokens = tokenize(text);
	const frequency = new Map<string, number>();
	for (const token of tokens) {
		frequency.set(token, (frequency.get(token) ?? 0) + 1);
	}

	const scored = sentences.map((sentence, index) => {
		const sentenceTokens = tokenize(sentence);
		const score =
			sentenceTokens.reduce(
				(sum, token) => sum + (frequency.get(token) ?? 0),
				0,
			) /
				Math.max(sentenceTokens.length, 1) +
			(index === 0 ? 1.5 : 0);
		return { sentence, score, index };
	});

	const chosen = scored
		.slice()
		.sort((a, b) => b.score - a.score)
		.slice(0, Math.min(2, sentences.length))
		.sort((a, b) => a.index - b.index)
		.map((item) => item.sentence);

	const keyPoints = [...frequency.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5)
		.map(([token]) => token);

	return { summary: chosen.join(" "), keyPoints };
};

export const buildIdf = (documents: string[][]): Map<string, number> => {
	const total = documents.length || 1;
	const documentFrequency = new Map<string, number>();

	for (const document of documents) {
		for (const term of new Set(document)) {
			documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		}
	}

	const idf = new Map<string, number>();
	for (const [term, frequency] of documentFrequency) {
		idf.set(term, Math.log(1 + total / (1 + frequency)));
	}
	return idf;
};

export const vectorize = (
	tokens: string[],
	idf: Map<string, number>,
): Vector => {
	const termFrequency = new Map<string, number>();
	for (const token of tokens) {
		termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
	}

	const vector: Vector = new Map();
	for (const [term, frequency] of termFrequency) {
		vector.set(
			term,
			(frequency / Math.max(tokens.length, 1)) * (idf.get(term) ?? 0),
		);
	}
	return vector;
};

export const cosineSimilarity = (a: Vector, b: Vector): number => {
	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (const value of a.values()) normA += value * value;
	for (const value of b.values()) normB += value * value;
	if (normA === 0 || normB === 0) return 0;

	for (const [term, value] of a) {
		dot += value * (b.get(term) ?? 0);
	}

	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const findSimilarIssues = (
	queryText: string,
	corpus: CorpusIssue[],
	limit = 5,
	minimumScore = 0.08,
): SimilarIssue[] => {
	if (corpus.length === 0) return [];

	const queryTokens = tokenize(queryText);
	const corpusTokens = corpus.map((issue) =>
		tokenize(`${issue.title} ${issue.description}`),
	);
	const idf = buildIdf([queryTokens, ...corpusTokens]);
	const queryVector = vectorize(queryTokens, idf);

	return corpus
		.map((issue, index) => ({
			issue,
			similarity: cosineSimilarity(
				queryVector,
				vectorize(corpusTokens[index] ?? [], idf),
			),
		}))
		.filter((item) => item.similarity >= minimumScore)
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, Math.max(1, Math.min(limit, 10)))
		.map(({ issue, similarity }) => ({
			id: issue.id,
			title: issue.title,
			category: issue.category,
			status: issue.status,
			location: issue.location,
			similarity: Number(similarity.toFixed(3)),
		}));
};
