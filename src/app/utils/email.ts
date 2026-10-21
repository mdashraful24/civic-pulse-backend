import config from "../config";
import { isEmailConfigured, transporter } from "../lib/nodemailer";

type RegistrationOtpEmail = {
	to: string;
	name: string;
	otp: string;
	expiresInMinutes: number;
};

export const sendRegistrationOtpEmail = async ({
	to,
	name,
	otp,
	expiresInMinutes,
}: RegistrationOtpEmail): Promise<void> => {
	if (config.node_env === "development") {
		console.log(`[dev] Registration OTP for ${to}: ${otp}`);
	}

	if (!isEmailConfigured) {
		if (config.is_production) {
			throw new Error("SMTP is not configured, cannot send the OTP email.");
		}

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
