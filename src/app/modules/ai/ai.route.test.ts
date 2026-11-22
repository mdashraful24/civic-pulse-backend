import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import type { Role } from "../../../../generated/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../../app";

const { fixtures } = vi.hoisted(() => ({
	fixtures: {
		issue: {
			id: "11111111-1111-4111-8111-111111111111",
			title: "Large pothole on Main Street",
			description:
				"A deep pothole and cracked pavement are blocking traffic near the crossing.",
			category: "ROADS",
			location: "Main Street",
			status: "PENDING",
			resolutionNote: null,
			createdAt: new Date("2026-11-01T10:00:00Z"),
		},
		assignedIssues: [
			{
				assigneeId: "personnel-1",
				title: "Pothole on Oak Avenue",
				description: "A pothole and cracked road surface near the crossing.",
				category: "ROADS",
				status: "RESOLVED",
			},
		],
		history: [
			{
				oldStatus: null,
				newStatus: "PENDING",
				note: "Report received",
				createdAt: new Date("2026-11-01T10:00:00Z"),
			},
			{
				oldStatus: "PENDING",
				newStatus: "IN_PROGRESS",
				note: "Crew dispatched",
				createdAt: new Date("2026-11-02T10:00:00Z"),
			},
		],
		personnel: [
			{ id: "personnel-1", name: "Alex Roads" },
			{ id: "personnel-2", name: "Sam Water" },
		],
	},
}));

vi.mock("../../lib/prisma", () => ({
	prisma: {
		issue: {
			findMany: vi.fn(
				async (args?: { where?: { assigneeId?: { in?: string[] } } }) =>
					args?.where?.assigneeId?.in
						? fixtures.assignedIssues
						: [fixtures.issue],
			),
			findUnique: vi.fn(async () => fixtures.issue),
		},
		issueHistory: { findMany: vi.fn(async () => fixtures.history) },
		user: { findMany: vi.fn(async () => fixtures.personnel) },
	},
}));

vi.mock("../../middlewares/auth", async () => {
	const { AppError } = await import("../../utils/AppError");

	const setUser = (
		req: Request,
		_res: Response,
		next: NextFunction,
		role: string,
	) => {
		(req as Request & { user?: unknown }).user = {
			id: "test-user",
			name: "Test User",
			email: "test@civicpulse.local",
			role: role as Role,
		};
		next();
	};

	return {
		requireAuth: (req: Request, res: Response, next: NextFunction) => {
			if (req.header("x-test-user") === "none") {
				next(AppError.unauthorized());
				return;
			}
			setUser(req, res, next, req.header("x-test-role") ?? "ADMIN");
		},
		requireRole:
			(...roles: string[]) =>
			(req: Request, res: Response, next: NextFunction) => {
				const role = req.header("x-test-role") ?? "ADMIN";
				if (!roles.includes(role)) {
					next(AppError.forbidden());
					return;
				}
				setUser(req, res, next, role);
			},
		currentUser: (req: Request & { user?: { id: string } }) => {
			if (!req.user) throw AppError.unauthorized();
			return { id: req.user.id, name: "Test User", email: "x", role: "ADMIN" };
		},
	};
});

const authed = (method: "get" | "post", path: string) =>
	request(app)[method](path).set("x-test-user", "test-user");

describe("GET /api/ai/capabilities", () => {
	it("returns the provider, catalogue and usage", async () => {
		const response = await authed("get", "/api/ai/capabilities");

		expect(response.status).toBe(200);
		expect(response.body.success).toBe(true);
		expect(response.body.data.provider).toBe("local");
		expect(response.body.data.capabilities).toHaveLength(7);
		expect(response.body.data.usage.limit).toBeGreaterThan(0);
	});

	it("rejects unauthenticated requests", async () => {
		const response = await request(app)
			.get("/api/ai/capabilities")
			.set("x-test-user", "none");

		expect(response.status).toBe(401);
		expect(response.body.success).toBe(false);
	});
});

describe("POST /api/ai/categorize", () => {
	const payload = {
		title: "Large pothole on Main Street",
		description:
			"A deep pothole and cracked pavement are blocking traffic near the crossing.",
	};

	it("returns a validated category suggestion", async () => {
		const response = await authed("post", "/api/ai/categorize").send(payload);

		expect(response.status).toBe(200);
		expect(response.body.data.category).toBe("ROADS");
		expect(response.body.data.confidence).toBeGreaterThan(0);
		expect(response.body.data.attribution.provider).toBe("local");
		expect(response.body.data.attribution.cached).toBe(false);
	});

	it("rejects short input with field-level details", async () => {
		const response = await authed("post", "/api/ai/categorize").send({
			title: "x",
			description: payload.description,
		});

		expect(response.status).toBe(400);
		expect(response.body.errors[0].field).toBe("title");
	});

	it("rejects unknown fields", async () => {
		const response = await authed("post", "/api/ai/categorize").send({
			...payload,
			role: "ADMIN",
		});

		expect(response.status).toBe(400);
	});
});

describe("POST /api/ai/summarize", () => {
	const issueId = "11111111-1111-4111-8111-111111111111";

	it("summarizes an existing issue including its history", async () => {
		const response = await authed("post", "/api/ai/summarize").send({
			issueId,
		});

		expect(response.status).toBe(200);
		expect(response.body.data.summary.length).toBeGreaterThan(10);
		expect(Array.isArray(response.body.data.keyPoints)).toBe(true);
	});

	it("rejects a request without text or issue id", async () => {
		const response = await authed("post", "/api/ai/summarize").send({});
		expect(response.status).toBe(400);
	});
});

describe("AI vector endpoints", () => {
	it("finds similar reports", async () => {
		const response = await authed("post", "/api/ai/duplicates").send({
			title: "Road pothole near crossing",
			description: "A pothole and cracked pavement are blocking the lane.",
			limit: 3,
		});

		expect(response.status).toBe(200);
		expect(response.body.data.matches[0].id).toBe(fixtures.issue.id);
		expect(response.body.data.attribution.provider).toBe("local");
	});

	it("runs semantic search with a query string", async () => {
		const response = await authed(
			"get",
			"/api/ai/search?q=water%20leak&limit=5",
		);

		expect(response.status).toBe(200);
		expect(response.body.data.query).toBe("water leak");
		expect(Array.isArray(response.body.data.results)).toBe(true);
	});

	it("rejects an empty search query", async () => {
		const response = await authed("get", "/api/ai/search?q=x");
		expect(response.status).toBe(400);
	});
});

describe("POST /api/ai/triage", () => {
	it("returns a structured multi-step result", async () => {
		const response = await authed("post", "/api/ai/triage").send({
			title: "Large pothole on Main Street",
			description:
				"A deep pothole and cracked pavement are blocking traffic near the crossing.",
			location: "Main Street",
		});

		expect(response.status).toBe(200);
		expect(response.body.data.category.category).toBe("ROADS");
		expect(response.body.data.priority.urgencyScore).toBeGreaterThan(0);
		expect(response.body.data.duplicates).toBeInstanceOf(Array);
		expect(response.body.data.actions).toBeInstanceOf(Array);
		expect(response.body.data.attribution.degraded).toBe(false);
	});
});

describe("POST /api/ai/recommend-assignee", () => {
	it("ranks personnel for an existing issue", async () => {
		const response = await authed("post", "/api/ai/recommend-assignee").send({
			issueId: "11111111-1111-4111-8111-111111111111",
		});

		expect(response.status).toBe(200);
		expect(response.body.data.recommendations.length).toBeGreaterThan(0);
		expect(response.body.data.recommendations[0].id).toBe("personnel-1");
	});

	it("forbids citizens", async () => {
		const response = await request(app)
			.post("/api/ai/recommend-assignee")
			.set("x-test-user", "test-user")
			.set("x-test-role", "CITIZEN")
			.send({ issueId: "11111111-1111-4111-8111-111111111111" });

		expect(response.status).toBe(403);
	});
});

describe("route wiring", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the standard envelope for successful requests", async () => {
		const response = await authed("get", "/api/ai/capabilities");
		expect(response.body).toMatchObject({
			success: true,
			statusCode: 200,
			message: expect.any(String),
		});
	});
});
