import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisMock, store } = vi.hoisted(() => {
	const values = new Map<string, string>();

	return {
		store: values,
		redisMock: {
			isOpen: true,
			get: vi.fn(async (key: string) => values.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => {
				values.set(key, value);
				return "OK";
			}),
			incr: vi.fn(async (key: string) => {
				const next = Number(values.get(key) ?? 0) + 1;
				values.set(key, String(next));
				return next;
			}),
		},
	};
});

vi.mock("../config", () => ({
	default: { cache_enabled: true, cache_ttl_seconds: 60 },
}));

vi.mock("../logger", () => ({
	default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./redis", () => ({ redisClient: redisMock }));

import { cacheAside, cacheKey, invalidateCache } from "./cache";

beforeEach(() => {
	store.clear();
	redisMock.isOpen = true;
	vi.clearAllMocks();
});

describe("cache", () => {
	it("reuses cached values until the scope is invalidated", async () => {
		const load = vi.fn(async () => ({ count: 1 }));

		const first = await cacheAside("issues", "key", load);
		const second = await cacheAside("issues", "key", load);

		expect(first).toEqual(second);
		expect(load).toHaveBeenCalledTimes(1);

		await invalidateCache("issues");

		const third = await cacheAside("issues", "key", load);
		expect(third).toEqual(first);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("falls back to the loader when Redis is unavailable", async () => {
		redisMock.isOpen = false;
		const load = vi.fn(async () => ({ count: 2 }));

		await cacheAside("issues", "key", load);
		await cacheAside("issues", "key", load);
		await invalidateCache("issues");

		expect(load).toHaveBeenCalledTimes(2);
		expect(redisMock.get).not.toHaveBeenCalled();
		expect(redisMock.incr).not.toHaveBeenCalled();
	});

	it("creates stable keys from structured values", () => {
		expect(cacheKey({ page: 1, search: "lamp" })).toBe(
			cacheKey({ page: 1, search: "lamp" }),
		);
		expect(cacheKey({ page: 1 })).not.toBe(cacheKey({ page: 2 }));
	});
});
