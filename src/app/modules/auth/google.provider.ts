import crypto from "node:crypto";
import config from "../../config";
import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export type GoogleProfile = {
	sub?: unknown;
	email?: unknown;
	email_verified?: unknown;
	name?: unknown;
	aud?: unknown;
};

type OAuthState = {
	codeVerifier: string;
	redirectUri: string;
};

export const isGoogleConfigured = (): boolean =>
	Boolean(
		config.google_client_id &&
			config.google_client_secret &&
			config.google_redirect_uri,
	);

const stateKey = (state: string) => `civicpulse-oauth-state:${state}`;

const assertGoogleConfigured = () => {
	if (!isGoogleConfigured()) {
		throw new AppError(503, "Google sign-in is not configured on this server.");
	}
};

const assertRedisReady = () => {
	if (!redisClient.isOpen) {
		throw new AppError(
			503,
			"Google sign-in is temporarily unavailable. Please try again later.",
		);
	}
};

const randomToken = () => crypto.randomBytes(32).toString("base64url");

export const createGoogleAuthorizationUrl = async (): Promise<string> => {
	assertGoogleConfigured();
	assertRedisReady();

	const state = randomToken();
	const codeVerifier = randomToken();
	const codeChallenge = crypto
		.createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");

	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set("client_id", config.google_client_id);
	url.searchParams.set("redirect_uri", config.google_redirect_uri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid email profile");
	url.searchParams.set("state", state);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("access_type", "online");
	url.searchParams.set("prompt", "select_account");

	await redisClient.set(
		stateKey(state),
		JSON.stringify({
			codeVerifier,
			redirectUri: config.google_redirect_uri,
		} satisfies OAuthState),
		{ EX: config.oauth_state_ttl_seconds, NX: true },
	);

	return url.toString();
};

const validateCallbackInput = (code: string, state: string) => {
	if (!code || code.length > 2048) {
		throw AppError.badRequest(
			"Google sign-in response is missing a valid code.",
		);
	}

	if (!/^[\w-]{20,200}$/.test(state)) {
		throw AppError.badRequest(
			"Google sign-in response is missing a valid state.",
		);
	}
};

const readOAuthState = async (state: string): Promise<OAuthState> => {
	const raw = await redisClient.get(stateKey(state));
	if (!raw) {
		throw AppError.badRequest(
			"Google sign-in session expired. Please start again.",
		);
	}

	await redisClient.del(stateKey(state));

	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			typeof (parsed as OAuthState).codeVerifier !== "string" ||
			typeof (parsed as OAuthState).redirectUri !== "string"
		) {
			throw new Error("invalid state");
		}

		return parsed as OAuthState;
	} catch {
		throw AppError.badRequest(
			"Google sign-in session is invalid. Please start again.",
		);
	}
};

const exchangeCodeForAccessToken = async (
	code: string,
	state: OAuthState,
): Promise<string> => {
	const response = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: config.google_client_id,
			client_secret: config.google_client_secret,
			grant_type: "authorization_code",
			redirect_uri: state.redirectUri,
			code_verifier: state.codeVerifier,
		}),
	});

	if (!response.ok) {
		throw AppError.unauthorized("Google sign-in failed. Please try again.");
	}

	const payload: unknown = await response.json();
	const accessToken = (payload as { access_token?: unknown })?.access_token;

	if (typeof accessToken !== "string" || !accessToken) {
		throw AppError.unauthorized("Google sign-in failed. Please try again.");
	}

	return accessToken;
};

const fetchGoogleProfile = async (
	accessToken: string,
): Promise<GoogleProfile> => {
	const response = await fetch(USERINFO_URL, {
		headers: { authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		throw AppError.unauthorized("Google sign-in failed. Please try again.");
	}

	return (await response.json()) as GoogleProfile;
};

export const exchangeGoogleCode = async (
	code: string,
	state: string,
): Promise<GoogleProfile> => {
	assertGoogleConfigured();
	assertRedisReady();
	validateCallbackInput(code, state);

	const oauthState = await readOAuthState(state);
	const accessToken = await exchangeCodeForAccessToken(code, oauthState);
	const profile = await fetchGoogleProfile(accessToken);

	if (
		typeof profile.sub !== "string" ||
		!profile.sub ||
		typeof profile.email !== "string" ||
		profile.email_verified !== true
	) {
		throw AppError.forbidden("A verified Google email is required to sign in.");
	}

	if (profile.aud !== undefined && profile.aud !== config.google_client_id) {
		throw AppError.unauthorized("Google sign-in failed. Please try again.");
	}

	return profile;
};
