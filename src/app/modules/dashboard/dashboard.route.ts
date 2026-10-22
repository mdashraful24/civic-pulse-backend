import { Router } from "express";
import { requireAuth } from "../../middlewares/auth";
import { IssueController } from "../issues/issue.controller";

const router = Router();

router.get("/stats", requireAuth, IssueController.stats);

export const DashboardRoutes = router;
