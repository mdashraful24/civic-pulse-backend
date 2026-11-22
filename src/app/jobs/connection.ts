import type { ConnectionOptions } from "bullmq";
import config from "../config";

export const queueConnection: ConnectionOptions = {
	host: config.redis_host,
	port: config.redis_port,
	username: config.redis_user || undefined,
	password: config.redis_password || undefined,
	tls: config.jobs_redis_tls ? {} : undefined,
	maxRetriesPerRequest: null,
};
