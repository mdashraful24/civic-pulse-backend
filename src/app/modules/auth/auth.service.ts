import crypto from "node:crypto";
import { Prisma } from "../../../../generated/prisma/client";
import config from "../../config";
import {
	deleteCloudinaryImage,
	uploadImageToCloudinary,
} from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { parseDuration } from "../../utils/duration";
import { sendRegistrationOtpEmail } from "../../utils/email";
import {
	createSessionId,
	hashToken,
	signAccessToken,
	signRefreshToken,
	verifyRefreshToken,
} from "../../utils/jwt";
import {
	DUMMY_PASSWORD_HASH,
	hashPassword,
	verifyPassword,
} from "../../utils/password";
import type {
	AuthResult,
	AuthTokens,
	ChangePasswordPayload,
	LoginPayload,
	PendingRegistration,
	PublicUser,
	RegisterPayload,
	RegistrationOtpResult,
	ResendOtpPayload,
	SessionContext,
	VerifyEmailPayload,
} from "./auth.interface";
import { PUBLIC_USER_SELECT } from "./auth.interface";

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const otpKey = (email: string) => `civicpulse-registration-otp:${email}`;
const registrationKey = (email: string) =>
	`civicpulse-registration-data:${email}`;

const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();

const otpMatches = (expected: string, received: string): boolean => {
	const a = Buffer.from(expected);
	const b = Buffer.from(received);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const assertRedisAvailable = () => {
	if (!redisClient.isOpen) {
		throw new AppError(
			503,
			"Email verification is temporarily unavailable. Please try again later.",
		);
	}
};

const otpExpiry = () => {
	const seconds = config.otp_expires_in_seconds;
	return {
		seconds,
		minutes: Math.ceil(seconds / 60),
		expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
	};
};

type TokenSubject = {
	id: string;
	name: string;
	email: string;
	role: PublicUser["role"];
	tokenVersion: number;
};

const buildTokens = (
	user: TokenSubject,
): AuthTokens & { sessionId: string } => {
	const sessionId = createSessionId();

	const accessToken = signAccessToken({
		sub: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
		tv: user.tokenVersion,
		type: "access",
	});

	const refreshToken = signRefreshToken({
		sub: user.id,
		jti: sessionId,
		tv: user.tokenVersion,
		type: "refresh",
	});

	return { accessToken, refreshToken, sessionId };
};

const buildSessionData = (
	user: TokenSubject,
	tokens: AuthTokens & { sessionId: string },
	ctx: SessionContext,
): Prisma.SessionUncheckedCreateInput => ({
	id: tokens.sessionId,
	userId: user.id,
	tokenHash: hashToken(tokens.refreshToken),
	expiresAt: new Date(
		Date.now() + parseDuration(config.jwt_refresh_expires_in),
	),
	userAgent: ctx.userAgent ?? null,
	ipAddress: ctx.ipAddress ?? null,
});

const register = async (
	payload: RegisterPayload,
	imageBuffer?: Buffer,
): Promise<RegistrationOtpResult> => {
	const email = normalizeEmail(payload.email);
	const name = payload.name.trim();

	const existing = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (existing) {
		throw AppError.conflict(
			"An account with this email address already exists. Please log in.",
		);
	}

	const passwordHash = await hashPassword(payload.password);

	const uploaded = imageBuffer
		? await uploadImageToCloudinary(imageBuffer, "civicpulse/users")
		: null;

	assertRedisAvailable();

	const otp = generateOtp();
	const expiry = otpExpiry();

	const pending: PendingRegistration = {
		name,
		email,
		passwordHash,
		imageUrl: uploaded?.secure_url ?? null,
		imagePublicId: uploaded?.public_id ?? null,
	};

	try {
		await redisClient.set(otpKey(email), otp, {
			expiration: { type: "EX", value: expiry.seconds },
		});

		await redisClient.set(registrationKey(email), JSON.stringify(pending), {
			expiration: {
				type: "EX",
				value: config.registration_session_expires_in_seconds,
			},
		});
	} catch (error) {
		await deleteCloudinaryImage(uploaded?.public_id ?? null);
		throw error;
	}

	await sendRegistrationOtpEmail({
		to: email,
		name,
		otp,
		expiresInMinutes: expiry.minutes,
	});

	return {
		expiresIn: expiry.seconds,
		expiresAt: expiry.expiresAt,
		sessionExpiresIn: config.registration_session_expires_in_seconds,
	};
};

const verifyEmail = async (payload: VerifyEmailPayload): Promise<void> => {
	const email = normalizeEmail(payload.email);
	const otp = payload.otp.trim();

	const existing = await prisma.user.findUnique({
		where: { email },
		select: {
			id: true,
			emailVerified: true,
			isDeleted: true,
			status: true,
		},
	});

	if (existing?.isDeleted || existing?.status === "DELETED") {
		throw AppError.forbidden("This account is no longer available.");
	}

	if (existing?.status === "BLOCKED") {
		throw AppError.forbidden(
			"Your account has been blocked. Please contact an administrator.",
		);
	}

	if (existing?.emailVerified) {
		throw AppError.badRequest(
			"This email address is already verified. Please log in.",
		);
	}

	assertRedisAvailable();

	const storedOtp = await redisClient.get(otpKey(email));

	if (!storedOtp) {
		throw AppError.badRequest(
			"The verification code has expired. Please request a new one.",
		);
	}

	if (!otpMatches(storedOtp, otp)) {
		throw AppError.badRequest("The verification code is not valid.");
	}

	const pendingRaw = await redisClient.get(registrationKey(email));

	if (!pendingRaw) {
		throw AppError.badRequest(
			"Your registration session has expired. Please register again.",
		);
	}

	const pending = JSON.parse(pendingRaw) as PendingRegistration;

	if (existing) {
		await prisma.user.update({
			where: { id: existing.id },
			data: {
				name: pending.name,
				passwordHash: pending.passwordHash,
				imageUrl: pending.imageUrl ?? null,
				imagePublicId: pending.imagePublicId ?? null,
				emailVerified: true,
				emailVerifiedAt: new Date(),
				status: "ACTIVE",
				isDeleted: false,
				deletedAt: null,
			},
		});
	} else {
		try {
			await prisma.user.create({
				data: {
					name: pending.name,
					email,
					passwordHash: pending.passwordHash,
					imageUrl: pending.imageUrl ?? null,
					imagePublicId: pending.imagePublicId ?? null,
					role: "CITIZEN",
					emailVerified: true,
					emailVerifiedAt: new Date(),
				},
			});
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				throw AppError.conflict(
					"An account with this email address already exists. Please log in.",
				);
			}
			throw error;
		}
	}

	await redisClient.del([otpKey(email), registrationKey(email)]);
};

const resendOtp = async (
	payload: ResendOtpPayload,
): Promise<RegistrationOtpResult> => {
	const email = normalizeEmail(payload.email);

	const existing = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (existing) {
		throw AppError.conflict(
			"An account with this email address already exists. Please log in.",
		);
	}

	assertRedisAvailable();

	const pendingRaw = await redisClient.get(registrationKey(email));

	if (!pendingRaw) {
		throw AppError.badRequest(
			"Your registration session has expired. Please register again.",
		);
	}

	const pending = JSON.parse(pendingRaw) as PendingRegistration;

	const otp = generateOtp();
	const expiry = otpExpiry();

	await redisClient.set(otpKey(email), otp, {
		expiration: { type: "EX", value: expiry.seconds },
	});

	await redisClient.expire(
		registrationKey(email),
		config.registration_session_expires_in_seconds,
	);

	await sendRegistrationOtpEmail({
		to: email,
		name: pending.name,
		otp,
		expiresInMinutes: expiry.minutes,
	});

	return {
		expiresIn: expiry.seconds,
		expiresAt: expiry.expiresAt,
		sessionExpiresIn: config.registration_session_expires_in_seconds,
	};
};

const login = async (
	payload: LoginPayload,
	ctx: SessionContext,
): Promise<AuthResult> => {
	const email = normalizeEmail(payload.email);

	const user = await prisma.user.findUnique({
		where: { email },
		select: {
			...PUBLIC_USER_SELECT,
			passwordHash: true,
			isDeleted: true,
			status: true,
			tokenVersion: true,
		},
	});

	const passwordMatches = await verifyPassword(
		payload.password,
		user?.passwordHash ?? DUMMY_PASSWORD_HASH,
	);

	if (!user || !passwordMatches) {
		throw AppError.unauthorized("Invalid email or password.");
	}

	if (user.isDeleted || user.status === "DELETED") {
		throw AppError.unauthorized("Invalid email or password.");
	}

	if (user.status === "BLOCKED") {
		throw AppError.forbidden(
			"Your account has been blocked. Please contact an administrator.",
		);
	}

	if (!user.emailVerified) {
		throw AppError.forbidden(
			"Your email address is not verified. Please verify it to continue.",
		);
	}

	const tokens = buildTokens(user);

	await prisma.$transaction([
		prisma.session.create({ data: buildSessionData(user, tokens, ctx) }),
		prisma.user.update({
			where: { id: user.id },
			data: { lastLoginAt: new Date() },
		}),
	]);

	const {
		passwordHash: _passwordHash,
		isDeleted: _isDeleted,
		tokenVersion: _tv,
		...publicUser
	} = user;

	return { user: publicUser, ...tokens };
};

const refresh = async (
	rawRefreshToken: string | undefined,
	ctx: SessionContext,
): Promise<AuthResult> => {
	if (!rawRefreshToken) {
		throw AppError.unauthorized("No active session. Please log in.");
	}

	const verified = verifyRefreshToken(rawRefreshToken);

	if (!verified.ok) {
		throw AppError.unauthorized("Your session has expired. Please log in.");
	}

	const { sub, tv } = verified.payload;
	const tokenHash = hashToken(rawRefreshToken);

	const session = await prisma.session.findUnique({ where: { tokenHash } });

	if (!session || session.userId !== sub) {
		throw AppError.unauthorized(
			"Your session is no longer valid. Please log in.",
		);
	}

	if (session.revokedAt) {
		await prisma.$transaction([
			prisma.session.updateMany({
				where: { userId: session.userId, revokedAt: null },
				data: { revokedAt: new Date(), revokedReason: "reuse-detected" },
			}),
			prisma.user.update({
				where: { id: session.userId },
				data: { tokenVersion: { increment: 1 } },
			}),
		]);

		throw AppError.unauthorized(
			"Your session was revoked for security reasons. Please log in again.",
		);
	}

	if (session.expiresAt.getTime() <= Date.now()) {
		throw AppError.unauthorized("Your session has expired. Please log in.");
	}

	const user = await prisma.user.findUnique({
		where: { id: sub },
		select: {
			...PUBLIC_USER_SELECT,
			isDeleted: true,
			status: true,
			tokenVersion: true,
		},
	});

	if (!user || user.isDeleted || user.status === "DELETED") {
		throw AppError.unauthorized(
			"Your session is no longer valid. Please log in.",
		);
	}

	if (user.status === "BLOCKED") {
		throw AppError.forbidden(
			"Your account has been blocked. Please contact an administrator.",
		);
	}

	if (!user.emailVerified) {
		throw AppError.forbidden(
			"Your email address is not verified. Please verify it to continue.",
		);
	}

	if (user.tokenVersion !== tv) {
		throw AppError.unauthorized(
			"Your session is no longer valid. Please log in.",
		);
	}

	const tokens = buildTokens(user);

	await prisma.$transaction([
		prisma.session.update({
			where: { id: session.id },
			data: { revokedAt: new Date(), revokedReason: "rotated" },
		}),
		prisma.session.create({ data: buildSessionData(user, tokens, ctx) }),
	]);

	const { isDeleted: _isDeleted, tokenVersion: _tv, ...publicUser } = user;

	return { user: publicUser, ...tokens };
};

const logout = async (rawRefreshToken: string | undefined): Promise<void> => {
	if (!rawRefreshToken) return;

	await prisma.session.updateMany({
		where: { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
		data: { revokedAt: new Date(), revokedReason: "logout" },
	});
};

const me = async (userId: string): Promise<PublicUser> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: PUBLIC_USER_SELECT,
	});

	if (!user) {
		throw AppError.unauthorized("This account is no longer available.");
	}

	return user;
};

const updateImage = async (
	userId: string,
	buffer: Buffer,
): Promise<PublicUser> => {
	const current = await prisma.user.findUnique({
		where: { id: userId },
		select: { imagePublicId: true },
	});

	if (!current) {
		throw AppError.unauthorized("This account is no longer available.");
	}

	const uploaded = await uploadImageToCloudinary(buffer, "civicpulse/users");

	let updated: PublicUser;

	try {
		updated = await prisma.user.update({
			where: { id: userId },
			data: {
				imageUrl: uploaded.secure_url,
				imagePublicId: uploaded.public_id,
			},
			select: PUBLIC_USER_SELECT,
		});
	} catch (error) {
		await deleteCloudinaryImage(uploaded.public_id);
		throw error;
	}

	await deleteCloudinaryImage(current.imagePublicId);

	return updated;
};

const removeImage = async (userId: string): Promise<PublicUser> => {
	const current = await prisma.user.findUnique({
		where: { id: userId },
		select: { imagePublicId: true },
	});

	if (!current) {
		throw AppError.unauthorized("This account is no longer available.");
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { imageUrl: null, imagePublicId: null },
		select: PUBLIC_USER_SELECT,
	});

	await deleteCloudinaryImage(current.imagePublicId);

	return updated;
};

const changePassword = async (
	userId: string,
	payload: ChangePasswordPayload,
): Promise<void> => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { passwordHash: true },
	});

	if (!user) {
		throw AppError.unauthorized("This account is no longer available.");
	}

	const reusesCurrentPassword = await verifyPassword(
		payload.newPassword,
		user.passwordHash,
	);

	if (reusesCurrentPassword) {
		throw AppError.badRequest(
			"New password must be different from your current password.",
		);
	}

	const passwordHash = await hashPassword(payload.newPassword);

	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: { passwordHash, tokenVersion: { increment: 1 } },
		}),
		prisma.session.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: new Date(), revokedReason: "password-changed" },
		}),
	]);
};

export const AuthService = {
	register,
	verifyEmail,
	resendOtp,
	login,
	refresh,
	logout,
	me,
	updateImage,
	removeImage,
	changePassword,
};
