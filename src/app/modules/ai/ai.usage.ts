import { createHash } from "node:crypto";
import config from "../../config";
import { AppError } from "../../utils/AppError";

type UsageEntry = { day: string; count: number };
type CacheEntry = { value: unknown; expiresAt: number };

const usage = new Map<string, UsageEntry>();
const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 500;

const today = () => new Date().toISOString().slice(0, 10);

export const getUsage = (userId: string) => {
	const entry = usage.get(userId);
	const usedToday = entry?.day === today() ? entry.count : 0;
	return {
		usedToday,
		limit: config.ai_daily_limit_per_user,
		remaining: Math.max(0, config.ai_daily_limit_per_user - usedToday),
	};
};

export const assertUsageAllowed = (userId: string) => {
	const { usedToday, limit } = getUsage(userId);
	if (usedToday >= limit) {
		throw new AppError(
			429,
			`AI usage limit reached (${limit} requests per day). Please try again tomorrow.`,
		);
	}
};

export const recordUsage = (userId: string) => {
	const entry = usage.get(userId);
	if (entry?.day === today()) {
		entry.count += 1;
	} else {
		usage.set(userId, { day: today(), count: 1 });
	}
};

export const makeCacheKey = (
	userId: string,
	task: string,
	input: unknown,
): string =>
	createHash("sha256")
		.update(`${userId}:${task}:${JSON.stringify(input)}`)
		.digest("hex");

const pruneCache = () => {
	if (cache.size <= MAX_CACHE_ENTRIES) return;
	const now = Date.now();
	for (const [key, entry] of cache) {
		if (entry.expiresAt <= now) cache.delete(key);
	}
};

export const getCached = <T>(key: string): T | undefined => {
	const entry = cache.get(key);
	if (!entry) return undefined;
	if (entry.expiresAt <= Date.now()) {
		cache.delete(key);
		return undefined;
	}
	return entry.value as T;
};

export const setCached = <T>(key: string, value: T) => {
	if (config.ai_cache_ttl_seconds <= 0) return;
	pruneCache();
	cache.set(key, {
		value,
		expiresAt: Date.now() + config.ai_cache_ttl_seconds * 1000,
	});
};
