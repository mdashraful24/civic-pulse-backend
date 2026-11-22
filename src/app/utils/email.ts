import config from "../config";
import { isEmailConfigured, transporter } from "../lib/nodemailer";
import logger from "../logger";

export type RegistrationOtpEmail = {
	to: string;
	name: string;
	otp: string;
	expiresInMinutes: number;
};

export type PasswordResetOtpEmail = RegistrationOtpEmail;

export const sendRegistrationOtpEmail = async ({
	to,
	name,
	otp,
	expiresInMinutes,
}: RegistrationOtpEmail): Promise<void> => {
	if (!isEmailConfigured) {
		if (config.is_production) {
			throw new Error("SMTP is not configured, cannot send the OTP email.");
		}

		logger.warn("SMTP is not configured; the OTP email was not sent.");
		return;
	}

	const text = [
		`Hi ${name},`,
		"",
		"Welcome to CivicPulse!",
		"",
		`Your verification code is: ${otp}`,
		"",
		`This code expires in ${expiresInMinutes} minutes.`,
		"",
		"If you did not create an account, you can safely ignore this email.",
		"No account is created unless this verification code is entered.",
		"",
		"CivicPulse - Community Issue Reporting Platform",
	].join("\n");

	await transporter.sendMail({
		from: config.email_sender || config.smtp_user,
		to,
		subject: "Verify Your Email - CivicPulse",
		text,
	});
};

export const sendPasswordResetOtpEmail = async ({
	to,
	name,
	otp,
	expiresInMinutes,
}: PasswordResetOtpEmail): Promise<void> => {
	if (!isEmailConfigured) {
		if (config.is_production) {
			throw new Error("SMTP is not configured, cannot send the reset email.");
		}

		logger.warn(
			"SMTP is not configured; the password reset email was not sent.",
		);
		return;
	}

	const text = [
		`Hi ${name},`,
		"",
		"A password reset was requested for your CivicPulse account.",
		"",
		`Your reset code is: ${otp}`,
		"",
		`This code expires in ${expiresInMinutes} minutes.`,
		"",
		"If you did not request this, you can safely ignore this email.",
		"",
		"CivicPulse - Community Issue Reporting Platform",
	].join("\n");

	await transporter.sendMail({
		from: config.email_sender || config.smtp_user,
		to,
		subject: "Reset Your Password - CivicPulse",
		text,
	});
};
