import { seedIssues } from "../prisma/all-seeds/issues.seed";
import { seedUsers } from "../prisma/all-seeds/seed";
import app from "./app";
import config, { assertRuntimeConfig } from "./app/config";
import { isCloudinaryConfigured } from "./app/lib/cloudinary";
import { isEmailConfigured, transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { connectRedis } from "./app/lib/redis";
import logger from "./app/logger";

const start = async () => {
	assertRuntimeConfig();

	await prisma.$connect();

	try {
		await connectRedis();
		logger.info("Redis connected.");
	} catch (error) {
		console.warn(
			"Redis is unavailable, so /auth/register, /auth/verify-email and /auth/resend-otp will return 503:",
			error instanceof Error ? error.message : String(error),
		);
	}

	if (isEmailConfigured) {
		try {
			await transporter.verify();
			logger.info("SMTP connected.");
		} catch (error) {
			console.warn(
				"SMTP verification failed:",
				error instanceof Error ? error.message : String(error),
			);
		}
	} else {
		console.warn(
			"SMTP is not configured. Registration OTPs will be printed to this console in development.",
		);
	}

	if (!isCloudinaryConfigured) {
		console.warn(
			"Cloudinary is not configured. Issue image uploads will return 503.",
		);
	}

	if (config.seed_on_start) {
		const { created, existing } = await seedUsers();
		const issues = await seedIssues();

		if (created.length > 0) {
			logger.info(`Seeded ${created.length} demo account(s):`);
			for (const account of created) {
				logger.info(`  - ${account.role.padEnd(9)} ${account.email}`);
			}
		} else if (existing.length > 0) {
			logger.info(`Demo accounts already present (${existing.length}).`);
		}

		if (issues.created > 0) {
			logger.info(`Seeded ${issues.created} demo issue(s).`);
		} else if (issues.existing > 0) {
			logger.info(`Demo issues already present (${issues.existing}).`);
		}
	}

	const server = app.listen(config.port, () => {
		logger.info(
			`CivicPulse API listening on http://localhost:${config.port} (${config.node_env})`,
		);
		logger.info("health - GET /health");
	});

	let shuttingDown = false;

	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;

		logger.info(`\n${signal} received, shutting down gracefully...`);

		const force = setTimeout(() => {
			console.error("Shutdown timed out, forcing exit.");
			process.exit(1);
		}, 10_000);
		force.unref();

		server.close(async (error) => {
			await prisma.$disconnect();
			if (error) {
				console.error("Error while closing the HTTP server:", error);
				process.exit(1);
			}
			process.exit(0);
		});
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

start().catch(async (error) => {
	console.error("Failed to start the CivicPulse API:", error);
	await prisma.$disconnect().catch(() => undefined);
	process.exit(1);
});
