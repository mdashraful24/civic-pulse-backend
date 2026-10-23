import { z } from "zod";
import { BCRYPT_MAX_BYTES } from "../../utils/password";

const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, "Email is required.")
	.max(254, "Email must not exceed 254 characters.")
	.pipe(z.email({ message: "Please provide a valid email address." }));

const strongPasswordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters long.")
	.max(128, "Password must not exceed 128 characters.")
	.refine(
		(value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_BYTES,
		`Password must not exceed ${BCRYPT_MAX_BYTES} bytes.`,
	)
	.regex(/[A-Za-z]/, "Password must contain at least one letter.")
	.regex(/\d/, "Password must contain at least one number.");

export const registerSchema = z.strictObject({
	name: z
		.string()
		.trim()
		.min(2, "Name must be at least 2 characters long.")
		.max(80, "Name must not exceed 80 characters."),
	email: emailSchema,
	password: strongPasswordSchema,
});

export const loginSchema = z.strictObject({
	email: emailSchema,
	password: z
		.string()
		.min(1, "Password is required.")
		.max(128, "Password must not exceed 128 characters."),
});

export const verifyEmailSchema = z.strictObject({
	email: emailSchema,
	otp: z
		.string()
		.trim()
		.regex(/^\d{6}$/, "The verification code must be 6 digits."),
});

export const resendOtpSchema = z.strictObject({
	email: emailSchema,
});

export const changePasswordSchema = z.strictObject({
	newPassword: strongPasswordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
