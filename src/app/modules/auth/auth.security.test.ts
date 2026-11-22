import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, fixtures } = vi.hoisted(() => {
	type CacheEntry = { value: string; expiresAt?: number };

	const store = new Map<string, CacheEntry>();

	return {
		store,
		fixtures: {
			user: {
				id: "11111111-1111-4111-8111-111111111111",
				name: "Taylor Citizen",
				email: "user@example.com",
				imageUrl: null,
				role: "CITIZEN",
				status: "ACTIVE",
				emailVerified: true,
				lastLoginAt: null,
				createdAt: new Date("2026-11-01T00:00:00Z"),
				updatedAt: new Date("2026-11-01T00:00:00Z"),
				passwordHash: "stored-hash",
				isDeleted: false,
				tokenVersion: 1,
			},
		},
	};
});

vi.mock("../../lib/redis", () => ({
	redisClient: {
		isOpen: true,
		get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
		set: vi.fn(
			async (key: string, value: string, options?: { EX?: number }) => {
				store.set(key, {
					value,
					expiresAt: options?.EX ? Date.now() + options.EX * 1000 : undefined,
				});
				return "OK";
			},
		),
		del: vi.fn(async (keys: string | string[]) => {
			const list = Array.isArray(keys) ? keys : [keys];
			for (const key of list) store.delete(key);
			return list.length;
		}),
		incr: vi.fn(async (key: string) => {
			const next = Number(store.get(key)?.value ?? 0) + 1;
			store.set(key, { value: String(next) });
			return next;
		}),
		expire: vi.fn(async (key: string, seconds: number) => {
			const entry = store.get(key);
			if (!entry) return false;
			entry.expiresAt = Date.now() + seconds * 1000;
			return true;
		}),
		ttl: vi.fn(async (key: string) => {
			const entry = store.get(key);
			if (!entry?.expiresAt) return -1;
			return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
		}),
	},
}));

vi.mock("../../jobs/email.queue", () => ({
	enqueueRegistrationOtpEmail: vi.fn(async () => undefined),
	enqueuePasswordResetOtpEmail: vi.fn(async () => undefined),
}));

vi.mock("../../utils/password", () => ({
	DUMMY_PASSWORD_HASH: "dummy-hash",
	hashPassword: vi.fn(async () => "hashed-new-password"),
	verifyPassword: vi.fn(
		async (password: string, hash: string) =>
			password === "Password123" && hash === "stored-hash",
	),
}));

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: {
			findUnique: vi.fn(async () => fixtures.user),
			update: vi.fn(async () => fixtures.user),
		},
		session: {
			create: vi.fn(async () => ({})),
			updateMany: vi.fn(async () => ({ count: 1 })),
		},
		$transaction: vi.fn(async (operations: Promise<unknown>[]) =>
			Promise.all(operations),
		),
	},
}));

import config from "../../config";
import { enqueuePasswordResetOtpEmail } from "../../jobs/email.queue";
import { prisma } from "../../lib/prisma";
import { AuthService } from "./auth.service";

beforeEach(() => {
	store.clear();
	vi.clearAllMocks();
});

describe("password reset", () => {
	it("sends a code and resets the password with it", async () => {
		const result = await AuthService.forgotPassword({
			email: " User@Example.com ",
		});

		expect(result.expiresIn).toBeGreaterThan(0);
		expect(enqueuePasswordResetOtpEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "user@example.com" }),
		);

		const otp = store.get(
			"civicpulse-password-reset-otp:user@example.com",
		)?.value;
		expect(otp).toMatch(/^\d{6}$/);

		await AuthService.resetPassword({
			email: "user@example.com",
			otp: otp as string,
			newPassword: "NewPassword123",
		});

		expect(prisma.user.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ passwordHash: "hashed-new-password" }),
			}),
		);
		expect(store.has("civicpulse-password-reset-otp:user@example.com")).toBe(
			false,
		);
	});

	it("rejects an invalid reset code", async () => {
		await expect(
			AuthService.resetPassword({
				email: "user@example.com",
				otp: "000000",
				newPassword: "NewPassword123",
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});
});

describe("login lockout", () => {
	it("locks an account after the configured number of failures", async () => {
		const login = () =>
			AuthService.login(
				{ email: "user@example.com", password: "WrongPassword123" },
				{},
			);

		for (let attempt = 0; attempt < config.login_lockout_threshold; attempt++) {
			await expect(login()).rejects.toMatchObject({ statusCode: 401 });
		}

		await expect(login()).rejects.toMatchObject({ statusCode: 423 });
	});
});
