import { describe, expect, it } from "vitest";
import config from "../../config";
import {
	assertUsageAllowed,
	getCached,
	getUsage,
	makeCacheKey,
	recordUsage,
	setCached,
} from "./ai.usage";

describe("AI usage limits", () => {
	it("tracks daily usage per user", () => {
		const userId = "11111111-1111-4111-8111-111111111111";
		const before = getUsage(userId).usedToday;
		recordUsage(userId);
		recordUsage(userId);
		expect(getUsage(userId).usedToday).toBe(before + 2);
	});

	it("blocks requests once the daily limit is reached", () => {
		const userId = "22222222-2222-4222-8222-222222222222";
		while (getUsage(userId).usedToday < config.ai_daily_limit_per_user) {
			recordUsage(userId);
		}
		expect(() => assertUsageAllowed(userId)).toThrow(/usage limit/i);
		expect(getUsage(userId).remaining).toBe(0);
	});
});

describe("AI response cache", () => {
	it("creates stable hash keys for identical input", () => {
		const a = makeCacheKey("user", "categorize", { title: "Leak", page: 1 });
		const b = makeCacheKey("user", "categorize", { title: "Leak", page: 1 });
		const c = makeCacheKey("user", "categorize", { title: "Leak", page: 2 });
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it("stores and retrieves cached responses", () => {
		const key = makeCacheKey("cache-user", "summarize", { text: "A report" });
		setCached(key, { summary: "A short summary." });
		expect(getCached<{ summary: string }>(key)).toEqual({
			summary: "A short summary.",
		});
	});
});
