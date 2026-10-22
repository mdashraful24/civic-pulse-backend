import { Router } from "express";
import { upload } from "../../lib/multer";
import { requireAuth, requireRole } from "../../middlewares/auth";
import {
	parseJsonBodyField,
	validateBody,
	validateParams,
	validateQuery,
} from "../../middlewares/validateRequest";
import { IssueController } from "./issue.controller";
import {
	assignIssueSchema,
	createIssueSchema,
	issueIdParamsSchema,
	issueListQuerySchema,
	updateIssuePrioritySchema,
	updateIssueSchema,
	updateIssueStatusSchema,
} from "./issue.validation";

const router = Router();

router.get("/", validateQuery(issueListQuerySchema), IssueController.list);

router.get(
	"/me",
	requireAuth,
	validateQuery(issueListQuerySchema),
	IssueController.listMine,
);

router.get(
	"/assigned",
	requireAuth,
	requireRole("PERSONNEL"),
	validateQuery(issueListQuerySchema),
	IssueController.listAssigned,
);

router.post(
	"/",
	requireAuth,
	requireRole("CITIZEN"),
	upload.single("image"),
	parseJsonBodyField("body"),
	validateBody(createIssueSchema),
	IssueController.create,
);

router.get(
	"/:id",
	validateParams(issueIdParamsSchema),
	IssueController.getById,
);

router.get(
	"/:id/history",
	validateParams(issueIdParamsSchema),
	IssueController.history,
);

router.patch(
	"/:id",
	requireAuth,
	validateParams(issueIdParamsSchema),
	validateBody(updateIssueSchema),
	IssueController.update,
);

router.patch(
	"/:id/image",
	requireAuth,
	validateParams(issueIdParamsSchema),
	upload.single("image"),
	IssueController.updateImage,
);

router.delete(
	"/:id",
	requireAuth,
	validateParams(issueIdParamsSchema),
	IssueController.remove,
);

router.patch(
	"/:id/assign",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(issueIdParamsSchema),
	validateBody(assignIssueSchema),
	IssueController.assign,
);

router.patch(
	"/:id/status",
	requireAuth,
	requireRole("ADMIN", "PERSONNEL"),
	validateParams(issueIdParamsSchema),
	validateBody(updateIssueStatusSchema),
	IssueController.changeStatus,
);

router.patch(
	"/:id/priority",
	requireAuth,
	requireRole("ADMIN"),
	validateParams(issueIdParamsSchema),
	validateBody(updateIssuePrioritySchema),
	IssueController.changePriority,
);

export const IssueRoutes = router;
