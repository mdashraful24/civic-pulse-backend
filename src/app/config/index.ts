import path from "node:path";
import dotenv from "dotenv";
import { parseDuration } from "../utils/duration";

dotenv.config({ path: path.join(process.cwd(), ".env"), quiet: true });

const optional = (key: string, fallback: string): string =>
	process.env[key]?.trim() || fallback;

const optionalNumber = (key: string, fallback: number): number => {
	const raw = process.env[key]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (Number.isNaN(parsed)) {
		throw new Error(
			`Environment variable ${key} must be a number, got "${raw}"`,
		);
	}
	return parsed;
};

const nodeEnv = optional("NODE_ENV", "development");
const isProduction = nodeEnv === "production";

type SameSite = "lax" | "strict" | "none";

const parseSameSite = (raw: string): SameSite => {
	const value = raw.toLowerCase();
	if (value === "lax" || value === "strict" || value === "none") return value;
	throw new Error(
		`COOKIE_SAME_SITE must be one of "lax", "strict" or "none", got "${raw}"`,
	);
};

const config = {
	node_env: nodeEnv,
	is_production: isProduction,

	port: optionalNumber("PORT", 5000),
	api_prefix: optional("API_PREFIX", "/api"),

	database_url: optional("DATABASE_URL", ""),

	frontend_url: optional("FRONTEND_URL", "http://localhost:3000"),

	google_client_id: optional("GOOGLE_CLIENT_ID", ""),
	google_client_secret: optional("GOOGLE_CLIENT_SECRET", ""),
	google_redirect_uri: optional("GOOGLE_REDIRECT_URI", ""),
	oauth_state_ttl_seconds: optionalNumber("OAUTH_STATE_TTL_SECONDS", 600),

	bcrypt_salt_rounds: optionalNumber("BCRYPT_SALT_ROUNDS", 12),

	jwt_access_secret: optional("JWT_ACCESS_SECRET", ""),
	jwt_refresh_secret: optional("JWT_REFRESH_SECRET", ""),
	jwt_access_expires_in: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
	jwt_refresh_expires_in: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
	jwt_issuer: optional("JWT_ISSUER", "civicpulse-api"),
	jwt_audience: optional("JWT_AUDIENCE", "civicpulse-web"),

	cookie_domain: process.env.COOKIE_DOMAIN?.trim() || undefined,
	cookie_secure: process.env.COOKIE_SECURE
		? process.env.COOKIE_SECURE.trim().toLowerCase() === "true"
		: isProduction,
	cookie_same_site: parseSameSite(
		optional("COOKIE_SAME_SITE", isProduction ? "none" : "lax"),
	),

	trust_proxy: optionalNumber("TRUST_PROXY", 0),

	redis_user: optional("REDIS_USER", ""),
	redis_password: optional("REDIS_PASSWORD", ""),
	redis_host: optional("REDIS_HOST", "127.0.0.1"),
	redis_port: optionalNumber("REDIS_PORT", 6379),

	cache_enabled: optional("CACHE_ENABLED", "true").toLowerCase() === "true",
	cache_ttl_seconds: optionalNumber("CACHE_TTL_SECONDS", 60),
	jobs_mode: optional("JOBS_MODE", "inline").toLowerCase(),
	jobs_queue_name: optional("JOBS_QUEUE_NAME", "civicpulse-jobs"),
	jobs_redis_tls: optional("JOBS_REDIS_TLS", "false").toLowerCase() === "true",

	smtp_user: optional("SMTP_USER", ""),
	smtp_password: optional("SMTP_PASSWORD", ""),
	email_sender: optional("EMAIL_SENDER", ""),

	cloudinary_cloud_name: optional("CLOUDINARY_CLOUD_NAME", ""),
	cloudinary_api_key: optional("CLOUDINARY_API_KEY", ""),
	cloudinary_api_secret: optional("CLOUDINARY_API_SECRET", ""),

	otp_expires_in_seconds: optionalNumber("OTP_EXPIRES_IN_SECONDS", 120),
	registration_session_expires_in_seconds: optionalNumber(
		"REGISTRATION_SESSION_EXPIRES_IN_SECONDS",
		300,
	),
	login_lockout_threshold: optionalNumber("LOGIN_LOCKOUT_THRESHOLD", 5),
	login_lockout_window_seconds: optionalNumber(
		"LOGIN_LOCKOUT_WINDOW_SECONDS",
		900,
	),
	login_lockout_duration_seconds: optionalNumber(
		"LOGIN_LOCKOUT_DURATION_SECONDS",
		900,
	),

	seed_admin_name: optional("SEED_ADMIN_NAME", "Local Admin"),
	seed_admin_email: optional("SEED_ADMIN_EMAIL", ""),
	seed_admin_password: optional("SEED_ADMIN_PASSWORD", ""),
	seed_admin_image_url: optional("SEED_ADMIN_IMAGE_URL", ""),
	seed_personnel_name: optional("SEED_PERSONNEL_NAME", "Local Personnel"),
	seed_personnel_email: optional("SEED_PERSONNEL_EMAIL", ""),
	seed_personnel_password: optional("SEED_PERSONNEL_PASSWORD", ""),
	seed_personnel_image_url: optional("SEED_PERSONNEL_IMAGE_URL", ""),
	seed_citizen_name: optional("SEED_CITIZEN_NAME", "Local Citizen"),
	seed_citizen_email: optional("SEED_CITIZEN_EMAIL", ""),
	seed_citizen_password: optional("SEED_CITIZEN_PASSWORD", ""),
	seed_citizen_image_url: optional("SEED_CITIZEN_IMAGE_URL", ""),
	seed_on_start: optional("SEED_ON_START", "false").toLowerCase() === "true",

	ai_provider: optional("AI_PROVIDER", "local").toLowerCase(),
	ai_api_key: optional("AI_API_KEY", ""),
	ai_model: optional("AI_MODEL", "gpt-4o-mini"),
	ai_timeout_ms: optionalNumber("AI_TIMEOUT_MS", 8000),
	ai_max_tokens: optionalNumber("AI_MAX_TOKENS", 512),
	ai_temperature: optionalNumber("AI_TEMPERATURE", 0.2),
	ai_daily_limit_per_user: optionalNumber("AI_DAILY_LIMIT_PER_USER", 100),
	ai_cache_ttl_seconds: optionalNumber("AI_CACHE_TTL_SECONDS", 300),
	ai_max_corpus_items: optionalNumber("AI_MAX_CORPUS_ITEMS", 500),
};

export const assertSeedConfig = () => {
	if (isProduction && config.seed_on_start) {
		throw new Error(
			"SEED_ON_START must be false in production. Demo data is for local development only.",
		);
	}

	if (!config.seed_on_start) return;

	const missing: string[] = [];

	if (!config.seed_admin_email) missing.push("SEED_ADMIN_EMAIL");
	if (!config.seed_admin_password) missing.push("SEED_ADMIN_PASSWORD");
	if (!config.seed_personnel_email) missing.push("SEED_PERSONNEL_EMAIL");
	if (!config.seed_personnel_password) missing.push("SEED_PERSONNEL_PASSWORD");
	if (!config.seed_citizen_email) missing.push("SEED_CITIZEN_EMAIL");
	if (!config.seed_citizen_password) missing.push("SEED_CITIZEN_PASSWORD");

	if (missing.length > 0) {
		throw new Error(
			`Seeding is enabled but missing environment variable(s): ${missing.join(", ")}.`,
		);
	}

	const emails = [
		config.seed_admin_email,
		config.seed_personnel_email,
		config.seed_citizen_email,
	].map((email) => email.trim().toLowerCase());

	if (new Set(emails).size !== emails.length) {
		throw new Error("Seed account emails must be unique.");
	}
};

export const assertRuntimeConfig = () => {
	const missing: string[] = [];

	if (!config.database_url) missing.push("DATABASE_URL");
	if (!config.jwt_access_secret) missing.push("JWT_ACCESS_SECRET");
	if (!config.jwt_refresh_secret) missing.push("JWT_REFRESH_SECRET");

	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variable(s): ${missing.join(", ")}. ` +
				"Copy .env.example to .env and fill in the values.",
		);
	}

	if (config.jwt_access_secret === config.jwt_refresh_secret) {
		throw new Error(
			"JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.",
		);
	}

	if (
		config.jwt_access_secret.length < 32 ||
		config.jwt_refresh_secret.length < 32
	) {
		throw new Error(
			"JWT secrets must be at least 32 characters long. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
		);
	}

	if (config.bcrypt_salt_rounds < 10 || config.bcrypt_salt_rounds > 15) {
		throw new Error("BCRYPT_SALT_ROUNDS must be between 10 and 15.");
	}

	if (!Number.isInteger(config.port) || config.port <= 0) {
		throw new Error("PORT must be a positive integer.");
	}

	if (config.cookie_same_site === "none" && !config.cookie_secure) {
		throw new Error(
			'COOKIE_SAME_SITE="none" requires COOKIE_SECURE="true" (browsers reject SameSite=None without Secure).',
		);
	}

	if (config.otp_expires_in_seconds <= 0) {
		throw new Error("OTP_EXPIRES_IN_SECONDS must be a positive integer.");
	}

	if (
		config.registration_session_expires_in_seconds <
		config.otp_expires_in_seconds
	) {
		throw new Error(
			"REGISTRATION_SESSION_EXPIRES_IN_SECONDS must be greater than or equal to OTP_EXPIRES_IN_SECONDS.",
		);
	}

	if (
		!Number.isInteger(config.login_lockout_threshold) ||
		config.login_lockout_threshold < 1
	) {
		throw new Error("LOGIN_LOCKOUT_THRESHOLD must be at least 1.");
	}

	if (
		!Number.isInteger(config.login_lockout_window_seconds) ||
		config.login_lockout_window_seconds <= 0
	) {
		throw new Error("LOGIN_LOCKOUT_WINDOW_SECONDS must be a positive integer.");
	}

	if (
		!Number.isInteger(config.login_lockout_duration_seconds) ||
		config.login_lockout_duration_seconds <= 0
	) {
		throw new Error(
			"LOGIN_LOCKOUT_DURATION_SECONDS must be a positive integer.",
		);
	}

	if (!Number.isInteger(config.redis_port) || config.redis_port <= 0) {
		throw new Error("REDIS_PORT must be a positive integer.");
	}

	if (
		!Number.isInteger(config.cache_ttl_seconds) ||
		config.cache_ttl_seconds <= 0
	) {
		throw new Error("CACHE_TTL_SECONDS must be a positive integer.");
	}

	if (!["inline", "queue"].includes(config.jobs_mode)) {
		throw new Error('JOBS_MODE must be one of "inline" or "queue".');
	}

	const googleValues = [
		config.google_client_id,
		config.google_client_secret,
		config.google_redirect_uri,
	].filter(Boolean);
	if (googleValues.length > 0 && googleValues.length !== 3) {
		throw new Error(
			"GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be provided together.",
		);
	}

	if (
		!Number.isInteger(config.oauth_state_ttl_seconds) ||
		config.oauth_state_ttl_seconds <= 0
	) {
		throw new Error("OAUTH_STATE_TTL_SECONDS must be a positive integer.");
	}

	if (!["local", "openai", "gemini"].includes(config.ai_provider)) {
		throw new Error(
			'AI_PROVIDER must be one of "local", "openai" or "gemini".',
		);
	}

	if (config.ai_provider !== "local" && !config.ai_api_key) {
		throw new Error(
			"AI_API_KEY is required when AI_PROVIDER is not local. " +
				'Set AI_PROVIDER="local" to use the built-in offline provider.',
		);
	}

	if (!Number.isInteger(config.ai_timeout_ms) || config.ai_timeout_ms <= 0) {
		throw new Error("AI_TIMEOUT_MS must be a positive integer.");
	}

	if (!Number.isInteger(config.ai_max_tokens) || config.ai_max_tokens <= 0) {
		throw new Error("AI_MAX_TOKENS must be a positive integer.");
	}

	if (config.ai_temperature < 0 || config.ai_temperature > 2) {
		throw new Error("AI_TEMPERATURE must be between 0 and 2.");
	}

	if (
		!Number.isInteger(config.ai_daily_limit_per_user) ||
		config.ai_daily_limit_per_user <= 0
	) {
		throw new Error("AI_DAILY_LIMIT_PER_USER must be a positive integer.");
	}

	if (config.ai_cache_ttl_seconds < 0) {
		throw new Error("AI_CACHE_TTL_SECONDS must not be negative.");
	}

	if (
		!Number.isInteger(config.ai_max_corpus_items) ||
		config.ai_max_corpus_items <= 0
	) {
		throw new Error("AI_MAX_CORPUS_ITEMS must be a positive integer.");
	}

	const cloudinaryValues = [
		config.cloudinary_cloud_name,
		config.cloudinary_api_key,
		config.cloudinary_api_secret,
	];
	const configuredCloudinaryValues = cloudinaryValues.filter(Boolean).length;

	if (
		configuredCloudinaryValues > 0 &&
		configuredCloudinaryValues < cloudinaryValues.length
	) {
		throw new Error(
			"CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set together.",
		);
	}

	if (isProduction) {
		const missingEmail: string[] = [];
		if (!config.smtp_user) missingEmail.push("SMTP_USER");
		if (!config.smtp_password) missingEmail.push("SMTP_PASSWORD");
		if (!config.email_sender) missingEmail.push("EMAIL_SENDER");

		if (missingEmail.length > 0) {
			throw new Error(
				`Missing required environment variable(s) for email delivery: ${missingEmail.join(", ")}.`,
			);
		}
	}

	const durations: Array<[string, string]> = [
		["JWT_ACCESS_EXPIRES_IN", config.jwt_access_expires_in],
		["JWT_REFRESH_EXPIRES_IN", config.jwt_refresh_expires_in],
	];

	for (const [key, value] of durations) {
		try {
			parseDuration(value);
		} catch (error) {
			throw new Error(
				`${key} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	assertSeedConfig();
};

export default config;
