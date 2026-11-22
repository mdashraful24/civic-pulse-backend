import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../../../generated/prisma/enums";
import app from "../../../app";

const actorId = "33333333-3333-4333-8333-333333333333";
const issue = {
	id: "44444444-4444-4444-8444-444444444444",
	title: "Broken lamp on Main Street",
	description: "Streetlight is out",
	location: "Main Street",
	createdAt: new Date("2026-11-20T10:00:00Z"),
};

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	count: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
	prisma: {
		issue: {
			findMany: mocks.findMany,
			count: mocks.count,
			findUnique: mocks.findMany,
		},
	},
}));

vi.mock("../../middlewares/auth", () => ({
	requireAuth: (req: Request, _res: Response, next: NextFunction) => {
		if (req.header("x-test-user") === "none") {
			next(new Error("Unauthorized"));
			return;
		}

		(req as Request & { user?: unknown }).user = {
			id: req.header("x-test-user") ?? actorId,
			name: "Test User",
			email: "test@civicpulse.local",
			role: (req.header("x-test-role") ?? "CITIZEN") as Role,
		};
		next();
	},
	requireRole:
		(...roles: string[]) =>
		(req: Request, _res: Response, next: NextFunction) => {
			const role = req.header("x-test-role") ?? "CITIZEN";
			if (!roles.includes(role)) {
				next(new Error("Forbidden"));
				return;
			}

			(req as Request & { user?: unknown }).user = {
				id: req.header("x-test-user") ?? actorId,
				name: "Test User",
				email: "test@civicpulse.local",
				role: role as Role,
			};
			next();
		},
	currentUser: (
		req: Request & { user?: { id: string; name: string; role: string } },
	) => {
		if (!req.user) throw new Error("Unauthorized");
		return {
			id: req.user.id,
			name: req.user.name,
			email: "test@civicpulse.local",
			role: req.user.role,
		};
	},
}));

type FindArgs = {
	where: Record<string, unknown>;
	orderBy: Array<Record<string, string>>;
	skip: number;
	take: number;
};

const lastFindArgs = () => mocks.findMany.mock.calls.at(-1)?.[0] as FindArgs;

const get = (path: string, headers: Record<string, string> = {}) => {
	let builder = request(app).get(path);
	for (const [name, value] of Object.entries(headers)) {
		builder = builder.set(name, value);
	}
	return builder;
};

describe("issue list queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findMany.mockResolvedValue([issue]);
		mocks.count.mockResolvedValue(7);
	});

	it("uses visible-only scope and stable default pagination", async () => {
		const response = await get("/api/issues");

		expect(response.status).toBe(200);
		expect(response.body.message).toBe("Issues retrieved.");
		expect(response.body.meta).toEqual({
			page: 1,
			limit: 10,
			total: 7,
			totalPages: 1,
		});

		const findArgs = lastFindArgs();
		expect(findArgs.where).toMatchObject({ moderationStatus: "VISIBLE" });
		expect(findArgs.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
		expect(findArgs.skip).toBe(0);
		expect(findArgs.take).toBe(10);
		expect(mocks.count.mock.calls[0]?.[0]?.where).toEqual(findArgs.where);
	});

	it("searches title, description and location while preserving scope", async () => {
		await get("/api/issues?search=lamp");

		const findArgs = lastFindArgs();
		expect(findArgs.where.OR).toEqual([
			{ title: { contains: "lamp", mode: "insensitive" } },
			{ description: { contains: "lamp", mode: "insensitive" } },
			{ location: { contains: "lamp", mode: "insensitive" } },
		]);
		expect(findArgs.where).toMatchObject({ moderationStatus: "VISIBLE" });
	});

	it("keeps reporter and assignee scoping alongside search", async () => {
		await get("/api/issues/me?search=lamp", { "x-test-user": actorId });
		expect(lastFindArgs().where).toMatchObject({ reporterId: actorId });

		await get("/api/issues/assigned?search=lamp", {
			"x-test-user": actorId,
			"x-test-role": "PERSONNEL",
		});
		expect(lastFindArgs().where).toMatchObject({ assigneeId: actorId });
	});

	it("combines filters and pagination", async () => {
		await get(
			"/api/issues?category=ROADS&priority=HIGH&status=PENDING&page=2&limit=5",
		);

		const findArgs = lastFindArgs();
		expect(findArgs.where).toMatchObject({
			category: "ROADS",
			priority: "HIGH",
			status: "PENDING",
		});
		expect(findArgs.skip).toBe(5);
		expect(findArgs.take).toBe(5);
	});

	it.each([
		["newest", [{ createdAt: "desc" }, { id: "asc" }]],
		["oldest", [{ createdAt: "asc" }, { id: "asc" }]],
		["updated", [{ updatedAt: "desc" }, { id: "asc" }]],
		["priority", [{ priority: "desc" }, { createdAt: "desc" }, { id: "asc" }]],
		["title", [{ title: "asc" }, { createdAt: "desc" }, { id: "asc" }]],
	])("maps %s sort to a deterministic order", async (sort, orderBy) => {
		await get(`/api/issues?sort=${sort}`);

		expect(lastFindArgs().orderBy).toEqual(orderBy);
	});

	it("sanitizes search input before querying", async () => {
		await get(
			`/api/issues?search=${encodeURIComponent("<script>alert(1)</script>lamp")}`,
		);

		expect(lastFindArgs().where.OR).toEqual([
			{ title: { contains: "lamp", mode: "insensitive" } },
			{ description: { contains: "lamp", mode: "insensitive" } },
			{ location: { contains: "lamp", mode: "insensitive" } },
		]);
	});

	it("rejects invalid query values", async () => {
		expect((await get("/api/issues?sort=random")).status).toBe(400);
		expect((await get("/api/issues?page=0")).status).toBe(400);
		expect((await get("/api/issues?limit=101")).status).toBe(400);
		expect((await get(`/api/issues?search=${"a".repeat(121)}`)).status).toBe(
			400,
		);
	});
});
