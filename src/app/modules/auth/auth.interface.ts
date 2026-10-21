import type { Prisma } from "../../../../generated/prisma/client";

export const PUBLIC_USER_SELECT = {
	id: true,
	name: true,
	email: true,
	role: true,
	status: true,
	emailVerified: true,
	lastLoginAt: true,
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
	select: typeof PUBLIC_USER_SELECT;
}>;

export type RegisterPayload = {
	name: string;
	email: string;
	password: string;
};

export type LoginPayload = {
	email: string;
	password: string;
};

export type VerifyEmailPayload = {
	email: string;
	otp: string;
};

export type ResendOtpPayload = {
	email: string;
};

export type PendingRegistration = {
	name: string;
	email: string;
	passwordHash: string;
};

export type RegistrationOtpResult = {
	expiresIn: number;
	expiresAt: string;
	sessionExpiresIn: number;
};

export type ChangePasswordPayload = {
	currentPassword: string;
	newPassword: string;
};

export type SessionContext = {
	userAgent?: string;
	ipAddress?: string;
};

export type AuthTokens = {
	accessToken: string;
	refreshToken: string;
};

export type AuthResult = AuthTokens & {
	user: PublicUser;
};
