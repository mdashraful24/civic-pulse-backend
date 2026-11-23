import { beforeEach, describe, expect, it, vi } from "vitest";

const { fixtures, prismaMock } = vi.hoisted(() => {
	const user = {
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
	};

	const tx = {
		user: { create: vi.fn(async () => user) },
		oAuthAccount: { create: vi.fn(async () => ({})) },
	};

	return {
		fixtures: { user },
		prismaMock: {
			user: {
				findUnique: vi.fn(async () => null as typeof user | null),
				update: vi.fn(async () => user),
			},
			oAuthAccount: {
				findUnique: vi.fn(
					async () => null as typeof user | null | { userId: string },
				),
				create: vi.fn(async () => ({})),
			},
			session: { create: vi.fn(async () => ({})) },
			$transaction: vi.fn(async (input: unknown) => {
				if (typeof input === "function") {
					return (input as (client: typeof tx) => Promise<unknown>)(tx);
				}
				return Promise.all(input as Promise<unknown>[]);
			}),
		},
	};
});

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("../../utils/password", () => ({
	DUMMY_PASSWORD_HASH: "dummy-hash",
	hashPassword: vi.fn(async () => "random-oauth-password-hash"),
	verifyPassword: vi.fn(async () => false),
}));
vi.mock("./google.provider", () => ({
	createGoogleAuthorizationUrl: vi.fn(
		async () => "https://accounts.google.com/o/oauth2/v2/auth?state=test",
	),
	exchangeGoogleCode: vi.fn(async () => ({
		sub: "google-user-1",
		email: "user@example.com",
		email_verified: true,
		name: "Taylor Citizen",
	})),
	verifyGoogleIdToken: vi.fn(async () => ({
		sub: "google-user-1",
		email: "user@example.com",
		email_verified: true,
		name: "Taylor Citizen",
	})),
}));

import {
	completeGoogleIdTokenSignIn,
	completeGoogleSignIn,
	startGoogleSignIn,
} from "./auth.oauth.service";
import { exchangeGoogleCode, verifyGoogleIdToken } from "./google.provider";

const callbackInput = { code: "code-123", state: "a".repeat(43) };
const ctx = { userAgent: "test-agent", ipAddress: "127.0.0.1" };

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.user.findUnique.mockResolvedValue(null);
	prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
	prismaMock.oAuthAccount.create.mockResolvedValue({});
	vi.mocked(exchangeGoogleCode).mockResolvedValue({
		sub: "google-user-1",
		email: "user@example.com",
		email_verified: true,
		name: "Taylor Citizen",
	});
	vi.mocked(verifyGoogleIdToken).mockResolvedValue({
		sub: "google-user-1",
		email: "user@example.com",
		email_verified: true,
		name: "Taylor Citizen",
	});
});

describe("Google OAuth service", () => {
	it("starts sign-in through the provider", async () => {
		await expect(startGoogleSignIn()).resolves.toContain(
			"accounts.google.com/o/oauth2/v2/auth",
		);
	});

	it("creates a verified OAuth-only user and session", async () => {
		const result = await completeGoogleSignIn(callbackInput, ctx);

		expect(result.user).toMatchObject({
			email: "user@example.com",
			emailVerified: true,
		});
		expect(result.accessToken).toEqual(expect.any(String));
		expect(prismaMock.session.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ userAgent: "test-agent" }),
			}),
		);
		expect(prismaMock.user.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { lastLoginAt: expect.any(Date) } }),
		);
	});

	it("links to an existing verified user by email", async () => {
		prismaMock.user.findUnique.mockResolvedValue(fixtures.user);

		const result = await completeGoogleSignIn(callbackInput, ctx);

		expect(result.user.id).toBe(fixtures.user.id);
		expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
			data: {
				userId: fixtures.user.id,
				provider: "GOOGLE",
				providerAccountId: "google-user-1",
			},
		});
	});

	it("reuses an existing provider link", async () => {
		prismaMock.oAuthAccount.findUnique.mockResolvedValue({
			userId: fixtures.user.id,
		});
		prismaMock.user.findUnique.mockResolvedValue(fixtures.user);

		const result = await completeGoogleSignIn(callbackInput, ctx);

		expect(result.user.id).toBe(fixtures.user.id);
		expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
	});

	it("rejects unverified existing email accounts", async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			...fixtures.user,
			emailVerified: false,
		});

		await expect(
			completeGoogleSignIn(callbackInput, ctx),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it("rejects blocked users", async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			...fixtures.user,
			status: "BLOCKED",
		});

		await expect(
			completeGoogleSignIn(callbackInput, ctx),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it("rejects provider error responses", async () => {
		await expect(
			completeGoogleSignIn({ error: "access_denied" }, ctx),
		).rejects.toMatchObject({ statusCode: 401 });
		expect(exchangeGoogleCode).not.toHaveBeenCalled();
	});

	it("creates a session from a verified Google ID token", async () => {
		const result = await completeGoogleIdTokenSignIn("id-token", ctx);

		expect(verifyGoogleIdToken).toHaveBeenCalledWith("id-token");
		expect(result.user).toMatchObject({
			email: "user@example.com",
			emailVerified: true,
		});
		expect(prismaMock.session.create).toHaveBeenCalled();
	});

	it("links an ID token to an existing verified user by email", async () => {
		prismaMock.user.findUnique.mockResolvedValue(fixtures.user);

		const result = await completeGoogleIdTokenSignIn("id-token", ctx);

		expect(result.user.id).toBe(fixtures.user.id);
		expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
			data: {
				userId: fixtures.user.id,
				provider: "GOOGLE",
				providerAccountId: "google-user-1",
			},
		});
	});
});
