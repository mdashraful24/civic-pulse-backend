import { Router } from "express";
import { upload } from "../../lib/multer";
import { requireAuth, requireRole } from "../../middlewares/auth";
import {
	validateParams,
	validateQuery,
} from "../../middlewares/validateRequest";
import { AdminController } from "./admin.controller";
import {
	adminUserParamsSchema,
	adminUsersQuerySchema,
} from "./admin.validation";

const router = Router();

router.get(
	"/users",
	requireAuth,
	requireRole("ADMIN"),
	validateQuery(adminUsersQuerySchema),
	AdminController.listUsers,
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

export const AdminRoutes = router;
