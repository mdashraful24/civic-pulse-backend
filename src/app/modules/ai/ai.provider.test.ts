import { describe, expect, it } from "vitest";
import { AI_PROMPTS } from "./ai.prompts";
import { localProvider } from "./ai.provider";
import {
	remoteCategorizeSchema,
	remotePrioritizeSchema,
	remoteSummarizeSchema,
	remoteTriageSchema,
} from "./ai.validation";

const text =
	"A deep pothole and cracked pavement are blocking traffic on Main Street near the crossing.";

describe("prompt templates", () => {
	it("include the report text and JSON output rules", () => {
		const prompt = AI_PROMPTS.categorize("Road damage", text);
		expect(prompt.system).toContain("JSON");
		expect(prompt.user).toContain("Road damage");
		expect(prompt.user).toContain(text);
	});

	it("describe tool-call actions in the triage prompt", () => {
		const prompt = AI_PROMPTS.triage("Road damage", text, {});
		expect(prompt.system).toContain("SET_CATEGORY");
		expect(prompt.system).toContain("ASSIGN");
	});
});

describe("local AI provider", () => {
	it("returns schema-valid categorization output", async () => {
		const prompt = AI_PROMPTS.categorize("Road damage", text);
		const result = await localProvider.complete({
			task: "categorize",
			system: prompt.system,
			user: prompt.user,
			text,
			schema: remoteCategorizeSchema,
		});

		expect(result.provider).toBe("local");
		expect(result.degraded).toBe(false);
		expect(result.data.category).toBe("ROADS");
		expect(result.data.confidence).toBeGreaterThan(0);
	});

	it("returns schema-valid priority output", async () => {
		const result = await localProvider.complete({
			task: "prioritize",
			system: "system",
			user: "user",
			text: "Flooding and exposed wires are a danger to children.",
			schema: remotePrioritizeSchema,
		});

		expect(result.data.priority).toBe("HIGH");
		expect(result.data.reasons.length).toBeGreaterThan(0);
	});

	it("returns schema-valid summary output", async () => {
		const result = await localProvider.complete({
			task: "summarize",
			system: "system",
			user: "user",
			text: "The lamp is dark. The pole is flickering every night near the park.",
			schema: remoteSummarizeSchema,
		});

		expect(result.data.summary.length).toBeGreaterThanOrEqual(10);
	});

	it("returns a structured multi-step triage object with actions", async () => {
		const result = await localProvider.complete({
			task: "triage",
			system: "system",
			user: "user",
			text,
			schema: remoteTriageSchema,
		});

		expect(result.data.category).toBe("ROADS");
		expect(result.data.actions.length).toBeGreaterThan(0);
		expect(result.data.actions[0]?.type).toMatch(
			/SET_CATEGORY|SET_PRIORITY|ADD_NOTE|ASSIGN/,
		);
	});

	it("rejects malformed local output through Zod validation", async () => {
		const strictSchema = remoteCategorizeSchema.refine(
			(value) => value.category === "WATER",
			{ message: "Expected WATER." },
		);

		await expect(
			localProvider.complete({
				task: "categorize",
				system: "system",
				user: "user",
				text,
				schema: strictSchema,
			}),
		).rejects.toThrow();
	});
});
