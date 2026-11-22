import { Queue } from "bullmq";
import config from "../config";
import logger from "../logger";
import {
	type PasswordResetOtpEmail,
	sendPasswordResetOtpEmail,
	type RegistrationOtpEmail,
	sendRegistrationOtpEmail,
} from "../utils/email";
import { queueConnection } from "./connection";

export const EMAIL_JOB_NAMES = {
	registrationOtp: "email.registration-otp",
	passwordResetOtp: "email.password-reset-otp",
} as const;

export type EmailJobPayload = RegistrationOtpEmail | PasswordResetOtpEmail;

let queue: Queue<EmailJobPayload> | null = null;

const getQueue = () => {
	if (config.jobs_mode !== "queue") return null;

	if (!queue) {
		queue = new Queue<EmailJobPayload>(config.jobs_queue_name, {
			connection: queueConnection,
		});
	}

	return queue;
};

const enqueueEmail = async (
	name: string,
	payload: EmailJobPayload,
	fallback: () => Promise<void>,
): Promise<void> => {
	const activeQueue = getQueue();
	if (!activeQueue) {
		await fallback();
		return;
	}

	try {
		await activeQueue.add(name, payload, {
			attempts: 2,
			backoff: { type: "fixed", delay: 1000 },
			removeOnComplete: true,
			removeOnFail: 50,
		});
	} catch (error) {
		logger.warn(`Email job queueing failed, sending inline: ${String(error)}`);
		await fallback();
	}
};

export const enqueueRegistrationOtpEmail = (
	payload: RegistrationOtpEmail,
): Promise<void> =>
	enqueueEmail(EMAIL_JOB_NAMES.registrationOtp, payload, () =>
		sendRegistrationOtpEmail(payload),
	);

export const enqueuePasswordResetOtpEmail = (
	payload: PasswordResetOtpEmail,
): Promise<void> =>
	enqueueEmail(EMAIL_JOB_NAMES.passwordResetOtp, payload, () =>
		sendPasswordResetOtpEmail(payload),
	);

export const closeEmailQueue = async (): Promise<void> => {
	if (!queue) return;

	await queue.close();
	queue = null;
};
