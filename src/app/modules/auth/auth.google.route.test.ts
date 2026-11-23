import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../../app";

const { mocks } = vi.hoisted(() => ({
	mocks: {
		complete: vi.fn(),
	},
}));

vi.mock("./google.provider", () => ({
	isGoogleConfigured: vi.fn(() => true),
}));

vi.mock("./auth.oauth.service", () => ({
	startGoogleSignIn: vi.fn(
		async () => "https://accounts.google.com/o/oauth2/v2/auth?state=test",
	),
	completeGoogleSignIn: mocks.complete,
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.complete.mockResolvedValue({
		user: { id: "11111111-1111-4111-8111-111111111111" },
		accessToken: "access-token",
		refreshToken: "refresh-token",
	});
});

describe("Google OAuth routes", () => {
	it("reports sign-in availability", async () => {
		const response = await request(app).get("/api/auth/google/status");

		expect(response.status).toBe(200);
		expect(response.body.data).toEqual({ enabled: true });
	});

	it("redirects to the Google consent screen", async () => {
		const response = await request(app).get("/api/auth/google");

		expect(response.status).toBe(302);
		expect(response.headers.location).toContain(
			"accounts.google.com/o/oauth2/v2/auth",
		);
	});

	it("sets session cookies and redirects after a successful callback", async () => {
		const response = await request(app).get(
			`/api/auth/google/callback?code=code-123&state=${"a".repeat(43)}&scope=openid`,
		);

		expect(response.status).toBe(303);
		expect(response.headers.location).toContain(
			"/auth/google/complete?status=success",
		);
		expect(response.headers["set-cookie"]).toBeDefined();
		expect(mocks.complete).toHaveBeenCalledWith(
			expect.objectContaining({ code: "code-123" }),
			expect.any(Object),
		);
	});

	it("redirects with an error status when Google denies access", async () => {
		mocks.complete.mockRejectedValueOnce(new Error("access denied"));

		const response = await request(app).get(
			`/api/auth/google/callback?error=access_denied&state=${"a".repeat(43)}`,
		);

		expect(response.status).toBe(303);
		expect(response.headers.location).toContain("status=error");
		expect(response.headers.location).toContain("reason=failed");
	});
});
