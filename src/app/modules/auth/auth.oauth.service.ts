import { randomBytes } from "node:crypto";
import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { hashPassword } from "../../utils/password";
import { sanitizeText } from "../../utils/sanitize";
import {
	buildSessionData,
	buildTokens,
	normalizeEmail,
	type TokenSubject,
} from "./auth.service";
import type { AuthResult, SessionContext } from "./auth.interface";
import { PUBLIC_USER_SELECT } from "./auth.interface";
import {
	type GoogleProfile,
	createGoogleAuthorizationUrl,
	exchangeGoogleCode,
} from "./google.provider";

const PROVIDER = "GOOGLE";

const OAUTH_USER_SELECT = {
	...PUBLIC_USER_SELECT,
	passwordHash: true,
	status: true,
	isDeleted: true,
	tokenVersion: true,
	emailVerified: true,
} as const satisfies Prisma.UserSelect;

type OAuthUser = Prisma.UserGetPayload<{
	select: typeof OAUTH_USER_SELECT;
}>;

export type GoogleCallbackInput = {
	code?: string;
	state?: string;
	error?: string;
};

export const startGoogleSignIn = (): Promise<string> =>
	createGoogleAuthorizationUrl();

const assertUsableUser = (user: OAuthUser) => {
	if (user.isDeleted || user.status === "DELETED") {
		throw AppError.unauthorized("Google sign-in could not be completed.");
	}

	if (user.status === "BLOCKED") {
		throw AppError.forbidden(
			"Your account has been blocked. Please contact an administrator.",
		);
	}

	if (!user.emailVerified) {
		throw AppError.forbidden(
			"Verify your email address before signing in with Google.",
		);
	}
};

const findUserByProvider = async (
	providerAccountId: string,
): Promise<OAuthUser | null> => {
	const account = await prisma.oAuthAccount.findUnique({
		where: {
			provider_providerAccountId: {
				provider: PROVIDER,
				providerAccountId,
			},
		},
		select: { userId: true },
	});

	if (!account) return null;

	const user = await prisma.user.findUnique({
		where: { id: account.userId },
		select: OAUTH_USER_SELECT,
	});

	if (!user) {
		throw AppError.unauthorized("Google sign-in could not be completed.");
	}

	assertUsableUser(user);
	return user;
};

const isProviderConflict = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2002";

const createOauthUser = async (
	profile: GoogleProfile,
	email: string,
	name: string,
): Promise<OAuthUser> => {
	const providerAccountId = profile.sub as string;

	try {
		return await prisma.$transaction(async (tx) => {
			const user = await tx.user.create({
				data: {
					name,
					email,
					passwordHash: await hashPassword(
						randomBytes(32).toString("base64url"),
					),
					emailVerified: true,
					emailVerifiedAt: new Date(),
					role: "CITIZEN",
				},
				select: OAUTH_USER_SELECT,
			});

			await tx.oAuthAccount.create({
				data: { userId: user.id, provider: PROVIDER, providerAccountId },
			});

			return user;
		});
	} catch (error) {
		if (isProviderConflict(error)) {
			const existing = await findUserByProvider(providerAccountId);
			if (existing) return existing;
		}

		throw AppError.conflict(
			"Google sign-in could not be completed. Please try again.",
		);
	}
};

const resolveGoogleUser = async (
	profile: GoogleProfile,
): Promise<OAuthUser> => {
	const providerAccountId = profile.sub as string;
	const linkedUser = await findUserByProvider(providerAccountId);
	if (linkedUser) return linkedUser;

	const email = normalizeEmail(profile.email as string);
	const name =
		sanitizeText(typeof profile.name === "string" ? profile.name : "").slice(
			0,
			80,
		) || email.split("@")[0].slice(0, 80);

	const existingUser = await prisma.user.findUnique({
		where: { email },
		select: OAUTH_USER_SELECT,
	});

	if (!existingUser) {
		return createOauthUser(profile, email, name);
	}

	assertUsableUser(existingUser);

	try {
		await prisma.oAuthAccount.create({
			data: { userId: existingUser.id, provider: PROVIDER, providerAccountId },
		});
		return existingUser;
	} catch (error) {
		if (isProviderConflict(error)) {
			const concurrentLink = await findUserByProvider(providerAccountId);
			if (concurrentLink) return concurrentLink;
		}

		throw AppError.conflict(
			"Google sign-in could not be completed. Please try again.",
		);
	}
};

const publicUser = ({
	passwordHash: _passwordHash,
	isDeleted: _isDeleted,
	tokenVersion: _tokenVersion,
	...user
}: OAuthUser) => user;

const createSession = async (
	user: OAuthUser,
	ctx: SessionContext,
): Promise<AuthResult> => {
	const tokens = buildTokens(user as TokenSubject);

	await prisma.$transaction([
		prisma.session.create({ data: buildSessionData(user, tokens, ctx) }),
		prisma.user.update({
			where: { id: user.id },
			data: { lastLoginAt: new Date() },
		}),
	]);

	return { user: publicUser(user), ...tokens };
};

export const completeGoogleSignIn = async (
	input: GoogleCallbackInput,
	ctx: SessionContext,
): Promise<AuthResult> => {
	if (input.error) {
		throw AppError.unauthorized("Google sign-in was cancelled or denied.");
	}

	if (!input.code || !input.state) {
		throw AppError.badRequest(
			"Google sign-in response is missing required parameters.",
		);
	}

	const profile = await exchangeGoogleCode(input.code, input.state);
	const user = await resolveGoogleUser(profile);
	return createSession(user, ctx);
};
