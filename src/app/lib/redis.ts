import { createClient } from "redis";
import config from "../config";
import logger from "../logger";

export const redisClient = createClient({
	username: config.redis_user || undefined,
	password: config.redis_password || undefined,
	socket: {
		host: config.redis_host,
		port: config.redis_port,
		reconnectStrategy: false,
	},
	disableOfflineQueue: true,
});

redisClient.on("error", (error: unknown) => {
	logger.error(
		"Redis error:",
		error instanceof Error ? error.message : String(error),
	);
});

export const connectRedis = async (): Promise<void> => {
	if (redisClient.isOpen) return;
	await redisClient.connect();
};
