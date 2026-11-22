import type { NextFunction, Request, Response } from "express";
import config from "../config";
import logger from "../logger";

export const requestLogger = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (config.node_env === "test") {
		next();
		return;
	}

	const startedAt = Date.now();

	res.on("finish", () => {
		const durationMs = Date.now() - startedAt;
		const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`;
		const meta = {
			method: req.method,
			url: req.originalUrl,
			statusCode: res.statusCode,
			durationMs,
			ip: req.ip,
			userAgent: req.get("user-agent"),
		};

		if (res.statusCode >= 500) logger.error(message, meta);
		else if (res.statusCode >= 400) logger.warn(message, meta);
		else logger.info(message, meta);
	});

	next();
};
