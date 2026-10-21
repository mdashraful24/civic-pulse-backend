import type { Request } from "express";
import httpStatus from "http-status";
import { currentUser } from "../../middlewares/auth";
import { catchAsync } from "../../utils/catchAsync";
import {
	clearAuthCookies,
	REFRESH_TOKEN_COOKIE,
	setAuthCookies,
} from "../../utils/cookie";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";
import type {
	ChangePasswordInput,
	LoginInput,
	RegisterInput,
	ResendOtpInput,
	VerifyEmailInput,
} from "./auth.validation";

const sessionContext = (req: Pick<Request, "get" | "ip">) => ({
	userAgent: req.get("user-agent") ?? undefined,
	ipAddress: req.ip,
});

const register = catchAsync(async (req, res) => {
	const result = await AuthService.register(req.body as RegisterInput);

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

export const AuthController = {
	register,
	verifyEmail,
	resendOtp,
	login,
	refresh,
	logout,
	me,
	changePassword,
};
