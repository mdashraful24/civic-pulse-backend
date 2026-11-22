import { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth";
import { aiLimiter } from "../../middlewares/rateLimit";
import { validateBody, validateQuery } from "../../middlewares/validateRequest";
import { AIController } from "./ai.controller";
import {
	aiAssigneeSchema,
	aiCategorizeSchema,
	aiDuplicateSchema,
	aiPrioritizeSchema,
	aiSearchQuerySchema,
	aiSummarizeSchema,
	aiTriageSchema,
} from "./ai.validation";

const router = Router();

router.get("/capabilities", requireAuth, AIController.capabilities);

router.get(
	"/search",
	aiLimiter,
	requireAuth,
	validateQuery(aiSearchQuerySchema),
	AIController.search,
);

router.post(
	"/categorize",
	aiLimiter,
	requireAuth,
	validateBody(aiCategorizeSchema),
	AIController.categorize,
);

router.post(
	"/prioritize",
	aiLimiter,
	requireAuth,
	validateBody(aiPrioritizeSchema),
	AIController.prioritize,
);

router.post(
	"/summarize",
	aiLimiter,
	requireAuth,
	validateBody(aiSummarizeSchema),
	AIController.summarize,
);

router.post(
	"/duplicates",
	aiLimiter,
	requireAuth,
	validateBody(aiDuplicateSchema),
	AIController.duplicates,
);

router.post(
	"/recommend-assignee",
	aiLimiter,
	requireAuth,
	requireRole("ADMIN", "PERSONNEL"),
	validateBody(aiAssigneeSchema),
	AIController.recommendAssignee,
);

router.post(
	"/triage",
	aiLimiter,
	requireAuth,
	validateBody(aiTriageSchema),
	AIController.triage,
);

export const AIRoutes = router;
