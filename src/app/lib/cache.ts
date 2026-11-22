import config from "../config";
import logger from "../logger";
import { redisClient } from "./redis";

const prefix = "civicpulse:cache:v1";

const isReady = () => config.cache_enabled && redisClient.isOpen;

const versionKey = (scope: string) => `${prefix}:${scope}:version`;

const entryKey = async (scope: string, key: string) => {
	if (!isReady()) return null;

	try {
		const keyVersion = versionKey(scope);
		let raw = await redisClient.get(keyVersion);
		if (!raw) {
			await redisClient.set(keyVersion, "1", { NX: true });
			raw = "1";
		}

		const version = Number(raw) || 1;
		return `${prefix}:${scope}:${version}:${key}`;
	} catch (error) {
		logger.debug(`Cache version lookup failed for ${scope}: ${String(error)}`);
		return null;
	}
};

export const cacheKey = (...parts: unknown[]): string =>
	JSON.stringify(parts.map((part) => part ?? null));

export const getCached = async <T>(
	scope: string,
	key: string,
): Promise<T | null> => {
	const resolvedKey = await entryKey(scope, key);
	if (!resolvedKey) return null;

	try {
		const raw = await redisClient.get(resolvedKey);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch (error) {
		logger.debug(`Cache read failed for ${resolvedKey}: ${String(error)}`);
		return null;
	}
};

export const setCached = async <T>(
	scope: string,
	key: string,
	value: T,
	ttlSeconds: number = config.cache_ttl_seconds,
): Promise<void> => {
	const resolvedKey = await entryKey(scope, key);
	if (!resolvedKey) return;

	try {
		await redisClient.set(resolvedKey, JSON.stringify(value), {
			EX: ttlSeconds,
		});
	} catch (error) {
		logger.debug(`Cache write failed for ${resolvedKey}: ${String(error)}`);
	}
};

export const cacheAside = async <T>(
	scope: string,
	key: string,
	load: () => Promise<T>,
	ttlSeconds?: number,
): Promise<T> => {
	const cached = await getCached<T>(scope, key);
	if (cached !== null) return cached;

	const value = await load();
	await setCached(scope, key, value, ttlSeconds);
	return value;
};

export const invalidateCache = async (scope: string): Promise<void> => {
	if (!isReady()) return;

	try {
		await redisClient.incr(versionKey(scope));
	} catch (error) {
		logger.debug(`Cache invalidation failed for ${scope}: ${String(error)}`);
	}
};
