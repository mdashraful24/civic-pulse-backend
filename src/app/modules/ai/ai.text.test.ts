import { describe, expect, it } from "vitest";
import type { CorpusIssue } from "./ai.interface";
import {
	buildIdf,
	categorizeHeuristic,
	cosineSimilarity,
	findSimilarIssues,
	rankCategories,
	summarizeHeuristic,
	tokenize,
	urgencyHeuristic,
	vectorize,
} from "./ai.text";

const corpus: CorpusIssue[] = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		title: "Large pothole on Main Street",
		description: "Deep pothole in the lane near the crossing, damaging cars.",
		category: "ROADS",
		location: "Main Street",
		status: "PENDING",
		createdAt: new Date("2026-11-01T10:00:00Z"),
	},
	{
		id: "22222222-2222-4222-8222-222222222222",
		title: "Streetlight out near the park",
		description: "The lamp is dark and the pole is flickering at night.",
		category: "STREETLIGHTS",
		location: "Central Park",
		status: "IN_PROGRESS",
		createdAt: new Date("2026-11-02T10:00:00Z"),
	},
	{
		id: "33333333-3333-4333-8333-333333333333",
		title: "Burst water pipe flooding the road",
		description: "Water leak from a pipe is flooding the gutter and lane.",
		category: "WATER",
		location: "Riverside",
		status: "PENDING",
		createdAt: new Date("2026-11-03T10:00:00Z"),
	},
	{
		id: "44444444-4444-4444-8444-444444444444",
		title: "Garbage bins overflowing",
		description: "Trash and waste bags are dumped beside the bins for days.",
		category: "WASTE",
		location: "Market Road",
		status: "RESOLVED",
		createdAt: new Date("2026-11-04T10:00:00Z"),
	},
];

describe("tokenize", () => {
	it("normalises text and removes stop words and short tokens", () => {
		const tokens = tokenize("The water PIPE is leaking again at Main Street!");
		expect(tokens).toContain("water");
		expect(tokens).toContain("pipe");
		expect(tokens).toContain("leaking");
		expect(tokens).not.toContain("the");
		expect(tokens).not.toContain("is");
	});

	it("returns an empty array for text without usable tokens", () => {
		expect(tokenize("the and is")).toEqual([]);
	});
});

describe("categorizeHeuristic", () => {
	it("classifies road reports", () => {
		const result = categorizeHeuristic(
			"Deep pothole and cracked pavement on the main road near the crossing.",
		);
		expect(result.category).toBe("ROADS");
		expect(result.confidence).toBeGreaterThan(0.5);
		expect(result.keywords).toContain("pothole");
	});

	it("classifies water and waste reports", () => {
		expect(
			categorizeHeuristic(
				"Water leak from a burst pipe is flooding the gutter.",
			).category,
		).toBe("WATER");
		expect(
			categorizeHeuristic("Garbage bins overflowing with trash and waste bags.")
				.category,
		).toBe("WASTE");
	});

	it("falls back to OTHER when there are no signals", () => {
		const result = categorizeHeuristic("A report about something unspecified.");
		expect(result.category).toBe("OTHER");
	});

	it("ranks categories by signal strength", () => {
		const ranked = rankCategories(
			"The lamp is dark and the streetlight flickers.",
		);
		expect(ranked[0]?.category).toBe("STREETLIGHTS");
	});
});

describe("urgencyHeuristic", () => {
	it("assigns high priority to hazards", () => {
		const result = urgencyHeuristic(
			"Flooding and exposed electrical wires are a danger to children.",
		);
		expect(result.priority).toBe("HIGH");
		expect(result.urgencyScore).toBeGreaterThanOrEqual(65);
		expect(result.reasons.length).toBeGreaterThan(0);
	});

	it("assigns low priority to cosmetic issues", () => {
		const result = urgencyHeuristic(
			"Minor cosmetic scratch on a nearby bench.",
		);
		expect(result.priority).toBe("LOW");
		expect(result.urgencyScore).toBeLessThan(35);
	});
});

describe("summarizeHeuristic", () => {
	it("keeps key sentences and extracts key points", () => {
		const result = summarizeHeuristic(
			"The water pipe burst on Main Street. Water is flooding the gutter. " +
				"The leak is getting worse each hour. Please send a repair crew.",
		);
		expect(result.summary.length).toBeGreaterThan(10);
		expect(result.keyPoints.length).toBeGreaterThan(0);
	});

	it("truncates very short unstructured input", () => {
		const result = summarizeHeuristic("pipeline");
		expect(result.summary).toBe("pipeline");
	});
});

describe("TF-IDF vector search", () => {
	it("produces a cosine similarity of 1 for identical vectors", () => {
		const documents = [
			tokenize("water leak pipe"),
			tokenize("garbage waste bin"),
		];
		const idf = buildIdf(documents);
		const vector = vectorize(documents[0] ?? [], idf);
		expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
	});

	it("returns unrelated vectors as dissimilar", () => {
		const idf = buildIdf([
			tokenize("water leak pipe flooding"),
			tokenize("garbage waste bin trash"),
		]);
		const a = vectorize(tokenize("water pipe"), idf);
		const b = vectorize(tokenize("garbage bin"), idf);
		expect(cosineSimilarity(a, b)).toBe(0);
	});

	it("finds the closest issue by meaning rather than exact title", () => {
		const matches = findSimilarIssues(
			"Pothole and cracked road surface blocking traffic near the crossing.",
			corpus,
			2,
		);
		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0]?.category).toBe("ROADS");
		expect(matches[0]?.similarity).toBeGreaterThan(0);
	});

	it("excludes an issue when requested", () => {
		const matches = findSimilarIssues(
			"Pothole and cracked road surface blocking traffic near the crossing.",
			corpus,
			10,
			0.01,
		);
		expect(matches.some((match) => match.id === corpus[0]?.id)).toBe(true);
		expect(
			findSimilarIssues(
				"Pothole and cracked road surface blocking traffic near the crossing.",
				corpus.filter((issue) => issue.id !== corpus[0]?.id),
				10,
				0.01,
			).some((match) => match.id === corpus[0]?.id),
		).toBe(false);
	});
});
