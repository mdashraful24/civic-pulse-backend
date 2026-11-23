import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "../../../../generated/prisma/enums";
import app from "../../../app";
import { prisma } from "../../lib/prisma";

const targetId = "11111111-1111-4111-8111-111111111111";
const flagId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";

const { fixtures } = vi.hoisted(() => ({
	fixtures: {
		user: {
			id: "11111111-1111-4111-8111-111111111111",
			name: "Taylor Citizen",
			email: "taylor@civicpulse.local",
			imageUrl: null,
			role: "CITIZEN",
			status: "ACTIVE",
			emailVerified: true,
			lastLoginAt: null,
			createdAt: new Date("2026-11-01T00:00:00Z"),
			roleValue: "CITIZEN",
			statusValue: "ACTIVE",
			_count: { reportedIssues: 2, assignedIssues: 0 },
		},
		issue: {
			id: "44444444-4444-4444-8444-444444444444",
			title: "Pothole on Main Street",
			category: "ROADS",
			status: "PENDING",
			priority: "HIGH",
			moderationStatus: "VISIBLE",
			createdAt: new Date("2026-11-20T10:00:00Z"),
			resolvedAt: null,
		},
		flag: {
			id: "22222222-2222-4222-8222-222222222222",
			issueId: "44444444-4444-4444-8444-444444444444",
			reporterId: "33333333-3333-4333-8333-333333333333",
			reason: "Duplicate report",
			status: "PENDING",
			action: "NONE",
			resolutionNote: null,
			createdAt: new Date("2026-11-21T10:00:00Z"),
			resolvedAt: null,
			issue: {
				id: "44444444-4444-4444-8444-444444444444",
				title: "Pothole on Main Street",
				category: "ROADS",
				status: "PENDING",
				moderationStatus: "VISIBLE",
			},
			reporter: {
				id: "33333333-3333-4333-8333-333333333333",
				name: "Reporter",
				email: "reporter@civicpulse.local",
			},
			resolvedBy: null,
		},
		log: {
			id: "55555555-5555-4555-8555-555555555555",
			action: "USER_ROLE_CHANGED",
			targetType: "USER",
			targetId: "11111111-1111-4111-8111-111111111111",
			metadata: { role: "ADMIN" },
			createdAt: new Date("2026-11-22T10:00:00Z"),
			actor: {
				id: "33333333-3333-4333-8333-333333333333",
				name: "CivicPulse Admin",
				email: "admin@civicpulse.local",
				role: "ADMIN",
			},
		},
		setting: {
			key: "site.notice",
			value: "Welcome",
			updatedAt: new Date("2026-11-22T10:00:00Z"),
		},
	},
}));

vi.mock("../../lib/prisma", () => ({
	prisma: {
		user: {
			findFirst: vi.fn(async () => fixtures.user),
			findUnique: vi.fn(async () => null),
			findMany: vi.fn(async () => [fixtures.user]),
			count: vi.fn(async () => 2),
			create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
				...fixtures.user,
				id: "66666666-6666-4666-8666-666666666666",
				...data,
			})),
			update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
				...fixtures.user,
				...data,
			})),
		},
		session: { updateMany: vi.fn(async () => ({ count: 1 })) },
		adminActionLog: {
			create: vi.fn(async () => fixtures.log),
			findMany: vi.fn(async () => [fixtures.log]),
			count: vi.fn(async () => 1),
		},
		issue: {
			findMany: vi.fn(async () => [fixtures.issue]),
			findUnique: vi.fn(async () => fixtures.issue),
			update: vi.fn(async () => fixtures.issue),
		},
		moderationFlag: {
			findFirst: vi.fn(async () => null),
			findUnique: vi.fn(async () => fixtures.flag),
			findMany: vi.fn(async () => [fixtures.flag]),
			count: vi.fn(async () => 1),
			create: vi.fn(async () => fixtures.flag),
			update: vi.fn(async () => fixtures.flag),
		},
		appSetting: {
			findMany: vi.fn(async () => [fixtures.setting]),
			upsert: vi.fn(async () => fixtures.setting),
		},
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
			id: req.header("x-test-user") ?? actorId,
			name: role === "ADMIN" ? "CivicPulse Admin" : "Test User",
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
		currentUser: (
			req: Request & { user?: { id: string; name: string; role: string } },
		) => {
			if (!req.user) throw AppError.unauthorized();
			return {
				id: req.user.id,
				name: req.user.name,
				email: "test@civicpulse.local",
				role: req.user.role as Role,
			};
		},
	};
});

const admin = (
	method: "get" | "post" | "patch" | "put" | "delete",
	path: string,
) =>
	request(app)
		[method](path)
		.set("x-test-user", actorId)
		.set("x-test-role", "ADMIN");

describe("admin analytics and activity", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns analytics for the requested range", async () => {
		const response = await admin("get", "/api/admin/analytics?days=7");

		expect(response.status).toBe(200);
		expect(response.body.data.days).toBe(7);
		expect(response.body.data.totalIssues).toBe(1);
		expect(response.body.data.highPriority).toBe(1);
	});

	it("rejects an unsupported range", async () => {
		const response = await admin("get", "/api/admin/analytics?days=12");
		expect(response.status).toBe(400);
	});

	it("returns the admin action log", async () => {
		const response = await admin("get", "/api/admin/activity");

		expect(response.status).toBe(200);
		expect(response.body.data[0].action).toBe("USER_ROLE_CHANGED");
		expect(prisma.adminActionLog.findMany).toHaveBeenCalled();
	});
});

describe("admin user controls", () => {
	beforeEach(() => vi.clearAllMocks());

	it("changes a user role and records the action", async () => {
		const response = await admin(
			"patch",
			`/api/admin/users/${targetId}/role`,
		).send({
			role: "PERSONNEL",
		});

		expect(response.status).toBe(200);
		expect(response.body.data.role).toBe("PERSONNEL");
		expect(prisma.adminActionLog.create).toHaveBeenCalled();
	});

	it("blocks a user and revokes sessions", async () => {
		const response = await admin(
			"patch",
			`/api/admin/users/${targetId}/status`,
		).send({
			status: "BLOCKED",
		});

		expect(response.status).toBe(200);
		expect(response.body.data.status).toBe("BLOCKED");
		expect(prisma.session.updateMany).toHaveBeenCalled();
	});

	it("resets a password and returns the temporary secret once", async () => {
		const response = await admin(
			"post",
			`/api/admin/users/${targetId}/reset-password`,
		);

		expect(response.status).toBe(200);
		expect(response.body.data.temporaryPassword.length).toBeGreaterThan(10);
	});

	it("terminates sessions", async () => {
		const response = await admin(
			"post",
			`/api/admin/users/${targetId}/terminate-sessions`,
		);

		expect(response.status).toBe(200);
		expect(prisma.session.updateMany).toHaveBeenCalled();
	});

	it("soft-deletes a user", async () => {
		const response = await admin("delete", `/api/admin/users/${targetId}`);

		expect(response.status).toBe(200);
		expect(prisma.user.update).toHaveBeenCalled();
	});

	it("rejects invalid roles", async () => {
		const response = await admin(
			"patch",
			`/api/admin/users/${targetId}/role`,
		).send({
			role: "OWNER",
		});

		expect(response.status).toBe(400);
	});

	it("prevents self-modification", async () => {
		const response = await request(app)
			.patch(`/api/admin/users/${actorId}/role`)
			.set("x-test-user", actorId)
			.set("x-test-role", "ADMIN")
			.send({ role: "CITIZEN" });

		expect(response.status).toBe(400);
	});

	it("forbids citizens", async () => {
		const response = await request(app)
			.patch(`/api/admin/users/${targetId}/role`)
			.set("x-test-user", actorId)
			.set("x-test-role", "CITIZEN")
			.send({ role: "ADMIN" });

		expect(response.status).toBe(403);
	});

	it("creates a user and records the action", async () => {
		const response = await admin("post", "/api/admin/users").send({
			name: "New Person",
			email: "New.Person@Example.com",
			password: "Secure-1234",
			role: "PERSONNEL",
			status: "ACTIVE",
		});

		expect(response.status).toBe(201);
		expect(response.body.data.email).toBe("new.person@example.com");
		expect(prisma.user.create).toHaveBeenCalled();
		expect(prisma.adminActionLog.create).toHaveBeenCalled();
	});

	it("rejects a duplicate email on create", async () => {
		vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
			fixtures.user as never,
		);

		const response = await admin("post", "/api/admin/users").send({
			name: "New Person",
			email: "taylor@civicpulse.local",
			password: "Secure-1234",
		});

		expect(response.status).toBe(409);
		expect(prisma.user.create).not.toHaveBeenCalled();
	});

	it("rejects an invalid create payload", async () => {
		const response = await admin("post", "/api/admin/users").send({
			name: "N",
			email: "not-an-email",
			password: "short",
		});

		expect(response.status).toBe(400);
	});

	it("updates user details", async () => {
		const response = await admin("patch", `/api/admin/users/${targetId}`).send({
			name: "Updated Person",
			email: "updated@example.com",
			role: "PERSONNEL",
			status: "BLOCKED",
		});

		expect(response.status).toBe(200);
		expect(response.body.data.name).toBe("Updated Person");
		expect(response.body.data.status).toBe("BLOCKED");
		expect(prisma.session.updateMany).toHaveBeenCalled();
	});

	it("revokes sessions when an admin sets a new password", async () => {
		const response = await admin("patch", `/api/admin/users/${targetId}`).send({
			password: "Secure-1234",
		});

		expect(response.status).toBe(200);
		expect(prisma.session.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					revokedAt: expect.any(Date),
					revokedReason: "admin-password-updated",
				},
			}),
		);
	});

	it("rejects an empty update payload", async () => {
		const response = await admin("patch", `/api/admin/users/${targetId}`).send(
			{},
		);

		expect(response.status).toBe(400);
	});

	it("prevents self role changes through general edits", async () => {
		const response = await request(app)
			.patch(`/api/admin/users/${actorId}`)
			.set("x-test-user", actorId)
			.set("x-test-role", "ADMIN")
			.send({ role: "CITIZEN" });

		expect(response.status).toBe(400);
	});
});

describe("moderation", () => {
	beforeEach(() => vi.clearAllMocks());

	it("lists pending flags for admins", async () => {
		const response = await admin(
			"get",
			"/api/admin/moderation/flags?status=PENDING",
		);

		expect(response.status).toBe(200);
		expect(response.body.data[0].issue.title).toBe("Pothole on Main Street");
	});

	it("lets an authenticated citizen submit a flag", async () => {
		const response = await request(app)
			.post("/api/admin/moderation/flags")
			.set("x-test-user", actorId)
			.set("x-test-role", "CITIZEN")
			.send({
				issueId: fixtures.issue.id,
				reason: "This report is a duplicate.",
			});

		expect(response.status).toBe(201);
		expect(prisma.moderationFlag.create).toHaveBeenCalled();
	});

	it("rejects unauthenticated flags", async () => {
		const response = await request(app)
			.post("/api/admin/moderation/flags")
			.set("x-test-user", "none")
			.send({ issueId: fixtures.issue.id, reason: "Duplicate report." });

		expect(response.status).toBe(401);
	});

	it("hides an issue when resolving a flag with HIDE", async () => {
		const response = await admin(
			"patch",
			`/api/admin/moderation/flags/${flagId}`,
		).send({
			status: "RESOLVED",
			action: "HIDE",
			note: "Confirmed spam.",
		});

		expect(response.status).toBe(200);
		expect(prisma.issue.update).toHaveBeenCalledWith({
			where: { id: fixtures.issue.id },
			data: { moderationStatus: "HIDDEN" },
		});
	});
});

describe("app settings", () => {
	beforeEach(() => vi.clearAllMocks());

	it("lists settings", async () => {
		const response = await admin("get", "/api/admin/settings");
		expect(response.status).toBe(200);
		expect(response.body.data[0].key).toBe("site.notice");
	});

	it("saves a setting", async () => {
		const response = await admin("put", "/api/admin/settings").send({
			key: "site.notice",
			value: "Service update",
		});

		expect(response.status).toBe(200);
		expect(prisma.appSetting.upsert).toHaveBeenCalled();
	});

	it("rejects invalid setting keys", async () => {
		const response = await admin("put", "/api/admin/settings").send({
			key: "Bad Key",
			value: "x",
		});
		expect(response.status).toBe(400);
	});
});
