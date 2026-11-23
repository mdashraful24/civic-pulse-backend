import { OAuth2Client } from "google-auth-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { configMock, redisMock, store } = vi.hoisted(() => {
	const values = new Map<string, string>();

	return {
		store: values,
		configMock: {
			google_client_id: "client-id",
			google_client_secret: "client-secret",
			google_redirect_uri: "http://localhost:3100/api/auth/google/callback",
			oauth_state_ttl_seconds: 600,
		},
		redisMock: {
			isOpen: true,
			get: vi.fn(async (key: string) => values.get(key) ?? null),
			set: vi.fn(async (key: string, value: string) => {
				values.set(key, value);
				return "OK";
			}),
			del: vi.fn(async (key: string) => {
				values.delete(key);
				return 1;
			}),
		},
	};
});

vi.mock("../../config", () => ({ default: configMock }));
vi.mock("../../lib/redis", () => ({ redisClient: redisMock }));
vi.mock("../../logger", () => ({ default: { warn: vi.fn() } }));

import {
	createGoogleAuthorizationUrl,
	exchangeGoogleCode,
	isGoogleIdTokenConfigured,
	verifyGoogleIdToken,
} from "./google.provider";

const verifyIdTokenSpy = vi.spyOn(OAuth2Client.prototype, "verifyIdToken");
const fetchMock = vi.fn();
const state = "a".repeat(43);

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

beforeEach(() => {
	store.clear();
	configMock.google_client_id = "client-id";
	configMock.google_client_secret = "client-secret";
	configMock.google_redirect_uri =
		"http://localhost:3100/api/auth/google/callback";
	redisMock.isOpen = true;
	fetchMock.mockReset();
	verifyIdTokenSpy.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.clearAllMocks();
});

describe("Google OAuth provider", () => {
	it("builds a PKCE authorization URL and stores single-use state", async () => {
		const url = new URL(await createGoogleAuthorizationUrl());

		expect(`${url.origin}${url.pathname}`).toBe(
			"https://accounts.google.com/o/oauth2/v2/auth",
		);
		expect(url.searchParams.get("client_id")).toBe("client-id");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("scope")).toBe("openid email profile");
		expect(store.size).toBe(1);
	});

	it("exchanges the code and returns a verified profile", async () => {
		store.set(
			`civicpulse-oauth-state:${state}`,
			JSON.stringify({
				codeVerifier: "verifier-123",
				redirectUri: configMock.google_redirect_uri,
			}),
		);
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ access_token: "access-token" }))
			.mockResolvedValueOnce(
				jsonResponse({
					sub: "google-user-1",
					email: "user@example.com",
					email_verified: true,
					name: "Example User",
					aud: "client-id",
				}),
			);

		const profile = await exchangeGoogleCode("code-123", state);

		expect(profile).toMatchObject({
			sub: "google-user-1",
			email: "user@example.com",
			email_verified: true,
		});
		expect(store.size).toBe(0);

		const tokenBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
		expect(tokenBody.get("code_verifier")).toBe("verifier-123");
	});

	it("rejects unverified Google emails", async () => {
		store.set(
			`civicpulse-oauth-state:${state}`,
			JSON.stringify({
				codeVerifier: "verifier-123",
				redirectUri: configMock.google_redirect_uri,
			}),
		);
		fetchMock
			.mockResolvedValueOnce(jsonResponse({ access_token: "access-token" }))
			.mockResolvedValueOnce(
				jsonResponse({
					sub: "google-user-1",
					email: "user@example.com",
					email_verified: false,
				}),
			);

		await expect(exchangeGoogleCode("code-123", state)).rejects.toMatchObject({
			statusCode: 403,
		});
		expect(store.size).toBe(0);
	});

	it("fails closed when Google OAuth is not configured", async () => {
		configMock.google_client_secret = "";

		await expect(createGoogleAuthorizationUrl()).rejects.toMatchObject({
			statusCode: 503,
		});
	});

	it("verifies an ID token with only the Google client ID", async () => {
		configMock.google_client_secret = "";
		configMock.google_redirect_uri = "";
		verifyIdTokenSpy.mockResolvedValue({
			getPayload: () => ({
				sub: "google-user-2",
				email: "id-token@example.com",
				email_verified: true,
				name: "ID Token User",
				aud: "client-id",
			}),
		} as never);

		expect(isGoogleIdTokenConfigured()).toBe(true);
		await expect(verifyGoogleIdToken("id-token")).resolves.toMatchObject({
			sub: "google-user-2",
			email: "id-token@example.com",
			email_verified: true,
		});
		expect(verifyIdTokenSpy).toHaveBeenCalledWith({
			idToken: "id-token",
			audience: "client-id",
		});
	});

	it("rejects invalid Google ID tokens", async () => {
		verifyIdTokenSpy.mockRejectedValue(new Error("invalid token"));

		await expect(verifyGoogleIdToken("bad-token")).rejects.toMatchObject({
			statusCode: 401,
		});
	});

	it("rejects Google ID tokens without a verified email", async () => {
		verifyIdTokenSpy.mockResolvedValue({
			getPayload: () => ({
				sub: "google-user-3",
				email: "unverified@example.com",
				email_verified: false,
				aud: "client-id",
			}),
		} as never);

		await expect(verifyGoogleIdToken("id-token")).rejects.toMatchObject({
			statusCode: 403,
		});
	});

	it("fails closed when ID-token sign-in has no client ID", async () => {
		configMock.google_client_id = "";

		expect(isGoogleIdTokenConfigured()).toBe(false);
		await expect(verifyGoogleIdToken("id-token")).rejects.toMatchObject({
			statusCode: 503,
		});
	});
});
