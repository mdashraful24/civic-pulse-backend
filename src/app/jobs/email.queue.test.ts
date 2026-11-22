import { beforeEach, describe, expect, it, vi } from "vitest";

const { configMock, queueMock } = vi.hoisted(() => ({
	configMock: {
		jobs_mode: "inline",
		jobs_queue_name: "civicpulse-jobs",
		redis_host: "127.0.0.1",
		redis_port: 6379,
		redis_user: "",
		redis_password: "",
		jobs_redis_tls: false,
	},
	queueMock: {
		add: vi.fn(async () => ({ id: "job-1" })),
		close: vi.fn(async () => undefined),
	},
}));

vi.mock("bullmq", () => ({
	Queue: vi.fn(
		class {
			add = queueMock.add;
			close = queueMock.close;
		},
	),
}));

vi.mock("../config", () => ({ default: configMock }));

vi.mock("../logger", () => ({
	default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../utils/email", () => ({
	sendRegistrationOtpEmail: vi.fn(async () => undefined),
	sendPasswordResetOtpEmail: vi.fn(async () => undefined),
}));

import { enqueueRegistrationOtpEmail } from "./email.queue";
import { sendRegistrationOtpEmail } from "../utils/email";

const payload = {
	to: "user@example.com",
	name: "Test User",
	otp: "123456",
	expiresInMinutes: 2,
};

beforeEach(() => {
	configMock.jobs_mode = "inline";
	queueMock.add.mockResolvedValue({ id: "job-1" });
	vi.clearAllMocks();
});

describe("email queue", () => {
	it("sends inline when queue mode is disabled", async () => {
		await enqueueRegistrationOtpEmail(payload);

		expect(sendRegistrationOtpEmail).toHaveBeenCalledWith(payload);
		expect(queueMock.add).not.toHaveBeenCalled();
	});

	it("enqueues when queue mode is enabled", async () => {
		configMock.jobs_mode = "queue";

		await enqueueRegistrationOtpEmail(payload);

		expect(queueMock.add).toHaveBeenCalledWith(
			"email.registration-otp",
			payload,
			expect.objectContaining({ attempts: 2 }),
		);
		expect(sendRegistrationOtpEmail).not.toHaveBeenCalled();
	});

	it("falls back to inline delivery when queueing fails", async () => {
		configMock.jobs_mode = "queue";
		queueMock.add.mockRejectedValueOnce(new Error("Redis is down"));

		await enqueueRegistrationOtpEmail(payload);

		expect(sendRegistrationOtpEmail).toHaveBeenCalledWith(payload);
	});
});
