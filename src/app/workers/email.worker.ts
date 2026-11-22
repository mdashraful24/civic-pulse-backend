import { Worker } from "bullmq";
import config from "../config";
import { queueConnection } from "../jobs/connection";
import { EMAIL_JOB_NAMES } from "../jobs/email.queue";
import type { EmailJobPayload } from "../jobs/email.queue";
import logger from "../logger";
import {
	type PasswordResetOtpEmail,
	sendPasswordResetOtpEmail,
	type RegistrationOtpEmail,
	sendRegistrationOtpEmail,
} from "../utils/email";

const worker = new Worker<EmailJobPayload>(
	config.jobs_queue_name,
	async (job) => {
		if (job.name === EMAIL_JOB_NAMES.registrationOtp) {
			await sendRegistrationOtpEmail(job.data as RegistrationOtpEmail);
			return;
		}

		if (job.name === EMAIL_JOB_NAMES.passwordResetOtp) {
			await sendPasswordResetOtpEmail(job.data as PasswordResetOtpEmail);
			return;
		}

		throw new Error(`Unknown email job: ${job.name}`);
	},
	{ connection: queueConnection, concurrency: 5 },
);

worker.on("completed", (job) => {
	logger.info(`Email job ${job.name} completed.`);
});

worker.on("failed", (job, error) => {
	logger.error(`Email job ${job?.name ?? "unknown"} failed: ${error.message}`);
});

const shutdown = async () => {
	await worker.close();
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logger.info(`Email worker started on ${config.jobs_queue_name}.`);
