import type { Request } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { currentUser } from "../../middlewares/auth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import {
	clearAuthCookies,
	REFRESH_TOKEN_COOKIE,
	setAuthCookies,
} from "../../utils/cookie";
import { sanitizeText } from "../../utils/sanitize";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import * as GoogleOAuthService from "./auth.oauth.service";
import {
	isGoogleConfigured,
	isGoogleIdTokenConfigured,
} from "./google.provider";
import type {
	ChangePasswordInput,
	GoogleCallbackQuery,
	GoogleIdTokenInput,
	ForgotPasswordInput,
	LoginInput,
	RegisterInput,
	ResendOtpInput,
	ResetPasswordInput,
	VerifyEmailInput,
} from "./auth.validation";

const sessionContext = (req: Pick<Request, "get" | "ip">) => ({
	userAgent:
		sanitizeText(req.get("user-agent") ?? "").slice(0, 500) || undefined,
	ipAddress: req.ip,
});

const register = catchAsync(async (req, res) => {
	const result = await AuthService.register(
		req.body as RegisterInput,
		req.file?.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message:
			"Registration started. A verification code has been sent to your email.",
		data: result,
	});
});

const verifyEmail = catchAsync(async (req, res) => {
	await AuthService.verifyEmail(req.body as VerifyEmailInput);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message:
			"Email verified successfully. Your account has been created. You can now log in.",
	});
});

const resendOtp = catchAsync(async (req, res) => {
	const result = await AuthService.resendOtp(req.body as ResendOtpInput);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "A new verification code has been sent to your email.",
		data: result,
	});
});

const login = catchAsync(async (req, res) => {
	const result = await AuthService.login(
		req.body as LoginInput,
		sessionContext(req),
	);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged in successfully.",
		data: result.user,
	});
});

const refresh = catchAsync(async (req, res) => {
	const result = await AuthService.refresh(
		req.cookies?.[REFRESH_TOKEN_COOKIE],
		sessionContext(req),
	);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Session refreshed.",
		data: result.user,
	});
});

const logout = catchAsync(async (req, res) => {
	await AuthService.logout(req.cookies?.[REFRESH_TOKEN_COOKIE]);

	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged out successfully.",
		data: null,
	});
});

const me = catchAsync(async (req, res) => {
	const user = await AuthService.me(currentUser(req).id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Current user retrieved.",
		data: user,
	});
});

const updateImage = catchAsync(async (req, res) => {
	if (!req.file) {
		throw AppError.badRequest(
			"No image uploaded. Send a JPEG, PNG, WebP or GIF file in the 'image' field.",
		);
	}

	const user = await AuthService.updateImage(
		currentUser(req).id,
		req.file.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile photo uploaded successfully.",
		data: user,
	});
});

const removeImage = catchAsync(async (req, res) => {
	const user = await AuthService.removeImage(currentUser(req).id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile photo removed successfully.",
		data: user,
	});
});

const forgotPassword = catchAsync(async (req, res) => {
	const result = await AuthService.forgotPassword(
		req.body as ForgotPasswordInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message:
			"If an active account exists for that email, a reset code has been sent.",
		data: result,
	});
});

const resetPassword = catchAsync(async (req, res) => {
	await AuthService.resetPassword(req.body as ResetPasswordInput);

	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message:
			"Password reset successfully. Please log in with your new password.",
		data: null,
	});
});

const changePassword = catchAsync(async (req, res) => {
	await AuthService.changePassword(
		currentUser(req).id,
		req.body as ChangePasswordInput,
	);

	clearAuthCookies(res);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password changed. Please log in again with your new password.",
		data: null,
	});
});

const googleStatus = catchAsync(async (_req, res) => {
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Google sign-in status retrieved.",
		data: {
			enabled: isGoogleIdTokenConfigured() || isGoogleConfigured(),
			idTokenEnabled: isGoogleIdTokenConfigured(),
			redirectEnabled: isGoogleConfigured(),
		},
	});
});

const googleIdTokenSignIn = catchAsync(async (req, res) => {
	const result = await GoogleOAuthService.completeGoogleIdTokenSignIn(
		(req.body as GoogleIdTokenInput).idToken,
		sessionContext(req),
	);

	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Signed in with Google successfully.",
		data: result.user,
	});
});

const googleStart = catchAsync(async (_req, res) => {
	const url = await GoogleOAuthService.startGoogleSignIn();
	res.redirect(httpStatus.FOUND, url);
});

const googleCallback = catchAsync(async (req, res) => {
	const redirectToComplete = (status: "success" | "error", reason?: string) => {
		const url = new URL("/auth/google/complete", config.frontend_url);
		url.searchParams.set("status", status);
		if (reason) url.searchParams.set("reason", reason);
		return url.toString();
	};

	try {
		const result = await GoogleOAuthService.completeGoogleSignIn(
			req.validatedQuery as GoogleCallbackQuery,
			sessionContext(req),
		);

		setAuthCookies(res, result);
		res.redirect(httpStatus.SEE_OTHER, redirectToComplete("success"));
	} catch (error) {
		const reason =
			error instanceof AppError && error.statusCode >= 500
				? "unavailable"
				: "failed";
		res.redirect(httpStatus.SEE_OTHER, redirectToComplete("error", reason));
	}
});

export const AuthController = {
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
	forgotPassword,
	resetPassword,
	googleStatus,
	googleIdTokenSignIn,
	googleStart,
	googleCallback,
};
