import { describe, expect, it } from "vitest";
import {
	aiCategorizeSchema,
	aiDuplicateSchema,
	aiSearchQuerySchema,
	aiSummarizeSchema,
	aiTriageSchema,
	remoteTriageSchema,
} from "./ai.validation";

const title = "Large pothole on Main Street";
const description =
	"A deep pothole in the lane is damaging cars near the pedestrian crossing.";

describe("AI input validation", () => {
	it("rejects short or unknown fields in categorisation", () => {
		expect(
			aiCategorizeSchema.safeParse({ title: "x", description }).success,
		).toBe(false);
		expect(
			aiCategorizeSchema.safeParse({ title, description, role: "ADMIN" })
				.success,
		).toBe(false);
		expect(aiCategorizeSchema.safeParse({ title, description }).success).toBe(
			true,
		);
	});

	it("requires either an issue id or text for summarisation", () => {
		expect(aiSummarizeSchema.safeParse({}).success).toBe(false);
		expect(aiSummarizeSchema.safeParse({ text: description }).success).toBe(
			true,
		);
		expect(
			aiSummarizeSchema.safeParse({
				issueId: "11111111-1111-4111-8111-111111111111",
			}).success,
		).toBe(true);
	});

	it("caps duplicate limit and rejects invalid ids", () => {
		expect(
			aiDuplicateSchema.safeParse({ title, description, limit: 99 }).success,
		).toBe(false);
		expect(
			aiDuplicateSchema.safeParse({
				title,
				description,
				excludeId: "not-a-uuid",
			}).success,
		).toBe(false);
	});

	it("validates semantic search query parameters", () => {
		expect(aiSearchQuerySchema.safeParse({ q: "x" }).success).toBe(false);
		expect(aiSearchQuerySchema.parse({ q: "water leak" })).toMatchObject({
			q: "water leak",
			limit: 8,
		});
	});

	it("accepts optional triage context but no unknown fields", () => {
		expect(
			aiTriageSchema.safeParse({
				title,
				description,
				category: "ROADS",
				location: "Main Street",
				issueId: "11111111-1111-4111-8111-111111111111",
			}).success,
		).toBe(true);
		expect(
			aiTriageSchema.safeParse({ title, description, forceAssign: true })
				.success,
		).toBe(false);
	});
});

describe("AI output validation", () => {
	it("rejects structured triage output with an unknown action", () => {
		const result = remoteTriageSchema.safeParse({
			category: "ROADS",
			priority: "HIGH",
			urgencyScore: 80,
			summary: "A deep pothole is blocking the lane.",
			rationale: "Traffic hazard.",
			actions: [{ type: "DELETE_ISSUE", value: "yes", reason: "because" }],
		});
		expect(result.success).toBe(false);
	});

	it("accepts a well-formed structured triage output", () => {
		const result = remoteTriageSchema.safeParse({
			category: "ROADS",
			priority: "HIGH",
			urgencyScore: 80,
			summary: "A deep pothole is blocking the lane.",
			rationale: "Traffic hazard.",
			actions: [
				{ type: "SET_PRIORITY", value: "HIGH", reason: "Traffic hazard." },
			],
		});
		expect(result.success).toBe(true);
	});
});
