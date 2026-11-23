import { Router } from "express";
import { upload } from "../../lib/multer";
import { requireAuth, requireRole } from "../../middlewares/auth";
import {
	validateBody,
	validateParams,
	validateQuery,
} from "../../middlewares/validateRequest";
import { AdminController } from "./admin.controller";
import {
	adminActivityQuerySchema,
	adminAnalyticsQuerySchema,
	adminFlagParamsSchema,
	adminUserParamsSchema,
	adminUsersQuerySchema,
	appSettingSchema,
	changeRoleSchema,
	changeStatusSchema,
	createAdminUserSchema,
	createFlagSchema,
	moderationFlagsQuerySchema,
	resolveFlagSchema,
	updateAdminUserSchema,
} from "./admin.validation";

const router = Router();

router.get(
	"/users",
	requireAuth,
	requireRole("ADMIN"),
	validateQuery(adminUsersQuerySchema),
	AdminController.listUsers,
);

router.post(
	"/users",
	requireAuth,
	requireRole("ADMIN"),
	validateBody(createAdminUserSchema),
	AdminController.createUser,
);

router.patch(
	"/users/:id/image",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	upload.single("image"),
	AdminController.updateUserImage,
);

router.delete(
	"/users/:id/image",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	AdminController.removeUserImage,
);

router.patch(
	"/users/:id/role",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	validateBody(changeRoleSchema),
	AdminController.changeRole,
);

router.patch(
	"/users/:id/status",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	validateBody(changeStatusSchema),
	AdminController.changeStatus,
);

router.post(
	"/users/:id/reset-password",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	AdminController.resetPassword,
);

router.post(
	"/users/:id/terminate-sessions",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	AdminController.terminateSessions,
);

router.patch(
	"/users/:id",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	validateBody(updateAdminUserSchema),
	AdminController.updateUser,
);

router.delete(
	"/users/:id",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminUserParamsSchema),
	AdminController.deleteUser,
);

router.get(
	"/analytics",
	requireAuth,
	requireRole("ADMIN"),
	validateQuery(adminAnalyticsQuerySchema),
	AdminController.analytics,
);

router.get(
	"/activity",
	requireAuth,
	requireRole("ADMIN"),
	validateQuery(adminActivityQuerySchema),
	AdminController.activity,
);

router.get(
	"/moderation/flags",
	requireAuth,
	requireRole("ADMIN"),
	validateQuery(moderationFlagsQuerySchema),
	AdminController.listFlags,
);

router.post(
	"/moderation/flags",
	requireAuth,
	validateBody(createFlagSchema),
	AdminController.createFlag,
);

router.patch(
	"/moderation/flags/:id",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(adminFlagParamsSchema),
	validateBody(resolveFlagSchema),
	AdminController.resolveFlag,
);

router.get(
	"/settings",
	requireAuth,
	requireRole("ADMIN"),
	AdminController.listSettings,
);

router.put(
	"/settings",
	requireAuth,
	requireRole("ADMIN"),
	validateBody(appSettingSchema),
	AdminController.updateSetting,
);

export const AdminRoutes = router;
