import { Router } from "express";
import { upload } from "../../lib/multer";
import { requireAuth } from "../../middlewares/auth";
import {
	authLimiter,
	loginLimiter,
	otpLimiter,
	registerLimiter,
} from "../../middlewares/rateLimit";
import {
	parseJsonBodyField,
	validateBody,
} from "../../middlewares/validateRequest";
import { AuthController } from "./auth.controller";
import {
	changePasswordSchema,
	loginSchema,
	registerSchema,
	resendOtpSchema,
	verifyEmailSchema,
} from "./auth.validation";

const router = Router();

router.post(
	"/register",
	authLimiter,
	registerLimiter,
	upload.single("image"),
	parseJsonBodyField("body"),
	validateBody(registerSchema),
	AuthController.register,
);

router.post(
	"/verify-email",
	authLimiter,
	otpLimiter,
	validateBody(verifyEmailSchema),
	AuthController.verifyEmail,
);

router.post(
	"/resend-otp",
	authLimiter,
	otpLimiter,
	validateBody(resendOtpSchema),
	AuthController.resendOtp,
);

router.post(
	"/login",
	authLimiter,
	loginLimiter,
	validateBody(loginSchema),
	AuthController.login,
);

router.post("/refresh-token", authLimiter, AuthController.refresh);

router.post("/logout", authLimiter, AuthController.logout);

router.get("/me", requireAuth, AuthController.me);

router.patch(
	"/me/image",
	requireAuth,
	upload.single("image"),
	AuthController.updateImage,
);

router.delete("/me/image", requireAuth, AuthController.removeImage);

router.post(
	"/change-password",
	requireAuth,
	validateBody(changePasswordSchema),
	AuthController.changePassword,
);

export const AuthRoutes = router;
