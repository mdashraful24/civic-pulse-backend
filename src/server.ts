import { seedIssues } from "../prisma/all-seeds/issues.seed";
import { seedUsers } from "../prisma/all-seeds/seed";
import app from "./app";
import config, { assertRuntimeConfig } from "./app/config";
import { isCloudinaryConfigured } from "./app/lib/cloudinary";
import { isEmailConfigured, transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { connectRedis } from "./app/lib/redis";

const start = async () => {
	assertRuntimeConfig();

	await prisma.$connect();

	try {
		await connectRedis();
		console.log("Redis connected.");
	} catch (error) {
		console.warn(
			"Redis is unavailable, so /auth/register, /auth/verify-email and /auth/resend-otp will return 503:",
			error instanceof Error ? error.message : String(error),
		);
	}

	if (isEmailConfigured) {
		try {
			await transporter.verify();
			console.log("SMTP connected.");
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
			console.log(`Seeded ${created.length} demo account(s):`);
			for (const account of created) {
				console.log(`  - ${account.role.padEnd(9)} ${account.email}`);
			}
		} else if (existing.length > 0) {
			console.log(`Demo accounts already present (${existing.length}).`);
		}

		if (issues.created > 0) {
			console.log(`Seeded ${issues.created} demo issue(s).`);
		} else if (issues.existing > 0) {
			console.log(`Demo issues already present (${issues.existing}).`);
		}
	}

	const server = app.listen(config.port, () => {
		console.log(
			`CivicPulse API listening on http://localhost:${config.port} (${config.node_env})`,
		);
		console.log("  health  GET /health");
	});

	let shuttingDown = false;

	const shutdown = async (signal: string) => {
		if (shuttingDown) return;
		shuttingDown = true;

		console.log(`\n${signal} received, shutting down gracefully...`);

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
