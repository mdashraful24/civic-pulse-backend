import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import httpStatus from "http-status";
import config from "./app/config";
import {
	globalErrorHandler,
	notFound,
} from "./app/middlewares/globalErrorHandler";
import { AdminRoutes } from "./app/modules/admin/admin.route";
import { AuthRoutes } from "./app/modules/auth/auth.route";
import { DashboardRoutes } from "./app/modules/dashboard/dashboard.route";
import { IssueRoutes } from "./app/modules/issues/issue.route";

const app = express();

if (config.trust_proxy > 0) {
	app.set("trust proxy", config.trust_proxy);
}

app.disable("x-powered-by");

app.use(compression());
app.use(helmet());

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
		methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
	}),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
	res.status(httpStatus.OK).json({
		success: true,
		statusCode: httpStatus.OK,
		message: "CivicPulse API is running.",
		data: { uptime: Math.round(process.uptime()) },
	});
});

app.use(`${config.api_prefix}/auth`, AuthRoutes);
app.use(`${config.api_prefix}/issues`, IssueRoutes);
app.use(`${config.api_prefix}/dashboard`, DashboardRoutes);
app.use(`${config.api_prefix}/admin`, AdminRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
