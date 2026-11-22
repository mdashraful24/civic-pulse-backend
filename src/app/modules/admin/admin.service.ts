import { randomBytes } from "node:crypto";
import type { Prisma } from "../../../../generated/prisma/client";
import {
	deleteCloudinaryImage,
	uploadImageToCloudinary,
} from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { invalidateIssueCaches } from "../issues/issue.service";
import { hashPassword } from "../../utils/password";
import type {
	AdminActivityQuery,
	AdminAnalyticsQuery,
	AdminUsersQuery,
	AppSettingInput,
	ChangeRoleInput,
	ChangeStatusInput,
	CreateFlagInput,
	ModerationFlagsQuery,
	ResolveFlagInput,
} from "./admin.validation";

const ADMIN_USER_SELECT = {
	id: true,
	name: true,
	email: true,
	imageUrl: true,
	role: true,
	status: true,
	emailVerified: true,
	lastLoginAt: true,
	createdAt: true,
	_count: {
		select: {
			reportedIssues: true,
			assignedIssues: true,
		},
	},
} as const satisfies Prisma.UserSelect;

const loadUserForChange = async (id: string) => {
	const user = await prisma.user.findFirst({
		where: { id, isDeleted: false },
		select: { id: true, imagePublicId: true },
	});

	if (!user) {
		throw AppError.notFound("This user no longer exists.");
	}

	return user;
};

const loadTargetUser = async (id: string) => {
	const user = await prisma.user.findFirst({
		where: { id, isDeleted: false },
		select: { id: true, role: true, status: true },
	});

	if (!user) {
		throw AppError.notFound("This user no longer exists.");
	}

	return user;
};

const ensureNotSelf = (actorId: string, targetId: string) => {
	if (actorId === targetId) {
		throw AppError.badRequest("You cannot change your own account here.");
	}
};

const ensureActiveAdminRemains = async (
	user: { id: string; role: string; status: string },
	nextRole?: string,
	nextStatus?: string,
) => {
	const staysAdmin = nextRole ? nextRole === "ADMIN" : user.role === "ADMIN";
	const staysActive = nextStatus
		? nextStatus === "ACTIVE"
		: user.status === "ACTIVE";

	if (!staysAdmin || !staysActive) {
		const activeAdmins = await prisma.user.count({
			where: { role: "ADMIN", status: "ACTIVE", isDeleted: false },
		});
		if (activeAdmins <= 1) {
			throw AppError.badRequest(
				"At least one active administrator must remain.",
			);
		}
	}
};

const revokeSessions = async (userId: string, reason: string) => {
	await prisma.session.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date(), revokedReason: reason },
	});
};

const logAction = async (
	actorId: string,
	action: string,
	targetType: string,
	targetId?: string,
	metadata?: Prisma.InputJsonValue,
) => {
	await prisma.adminActionLog.create({
		data: {
			actorId,
			action,
			targetType,
			targetId,
			metadata: metadata ?? {},
		},
	});
};

const updateUserImage = async (id: string, buffer: Buffer) => {
	const current = await loadUserForChange(id);

	const uploaded = await uploadImageToCloudinary(buffer, "civicpulse/users");

	let updated: Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

	try {
		updated = await prisma.user.update({
			where: { id },
			data: {
				imageUrl: uploaded.secure_url,
				imagePublicId: uploaded.public_id,
			},
			select: ADMIN_USER_SELECT,
		});
	} catch (error) {
		await deleteCloudinaryImage(uploaded.public_id);
		throw error;
	}

	await deleteCloudinaryImage(current.imagePublicId);
	await invalidateIssueCaches();

	return updated;
};

const removeUserImage = async (id: string): Promise<void> => {
	const current = await loadUserForChange(id);

	await prisma.user.update({
		where: { id },
		data: { imageUrl: null, imagePublicId: null },
	});

	await deleteCloudinaryImage(current.imagePublicId);
	await invalidateIssueCaches();
};

const listUsers = async (query: AdminUsersQuery) => {
	const where: Prisma.UserWhereInput = { isDeleted: false };

	if (query.role) where.role = query.role;
	if (query.status) where.status = query.status;
	if (query.search) {
		where.OR = [
			{ name: { contains: query.search, mode: "insensitive" } },
			{ email: { contains: query.search, mode: "insensitive" } },
		];
	}

	const [items, total] = await Promise.all([
		prisma.user.findMany({
			where,
			select: ADMIN_USER_SELECT,
			orderBy: { createdAt: "desc" },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.user.count({ where }),
	]);

	return {
		items,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit) || 0,
		},
	};
};

const changeRole = async (
	actorId: string,
	id: string,
	input: ChangeRoleInput,
) => {
	ensureNotSelf(actorId, id);
	const target = await loadTargetUser(id);
	await ensureActiveAdminRemains(target, input.role);

	const updated = await prisma.user.update({
		where: { id },
		data: { role: input.role },
		select: ADMIN_USER_SELECT,
	});

	await logAction(actorId, "USER_ROLE_CHANGED", "USER", id, {
		role: input.role,
	});
	await invalidateIssueCaches();

	return updated;
};

const changeStatus = async (
	actorId: string,
	id: string,
	input: ChangeStatusInput,
) => {
	ensureNotSelf(actorId, id);
	const target = await loadTargetUser(id);
	await ensureActiveAdminRemains(target, undefined, input.status);

	const updated = await prisma.user.update({
		where: { id },
		data: {
			status: input.status,
			tokenVersion: { increment: 1 },
		},
		select: ADMIN_USER_SELECT,
	});

	await revokeSessions(
		id,
		input.status === "BLOCKED" ? "account-blocked" : "account-unblocked",
	);
	await logAction(actorId, "USER_STATUS_CHANGED", "USER", id, {
		status: input.status,
	});
	await invalidateIssueCaches();

	return updated;
};

const deleteUser = async (actorId: string, id: string): Promise<void> => {
	ensureNotSelf(actorId, id);
	const target = await loadTargetUser(id);
	await ensureActiveAdminRemains(target, undefined, "DELETED");

	await prisma.user.update({
		where: { id },
		data: {
			status: "DELETED",
			isDeleted: true,
			deletedAt: new Date(),
			tokenVersion: { increment: 1 },
		},
	});
	await revokeSessions(id, "account-deleted");
	await logAction(actorId, "USER_DELETED", "USER", id);
	await invalidateIssueCaches();
};

const resetPassword = async (actorId: string, id: string) => {
	ensureNotSelf(actorId, id);
	await loadTargetUser(id);

	const temporaryPassword = randomBytes(12).toString("base64url");
	const passwordHash = await hashPassword(temporaryPassword);

	await prisma.user.update({
		where: { id },
		data: { passwordHash, tokenVersion: { increment: 1 } },
	});
	await revokeSessions(id, "password-reset");
	await logAction(actorId, "USER_PASSWORD_RESET", "USER", id);

	return { temporaryPassword };
};

const terminateSessions = async (actorId: string, id: string) => {
	ensureNotSelf(actorId, id);
	await loadTargetUser(id);

	await prisma.user.update({
		where: { id },
		data: { tokenVersion: { increment: 1 } },
	});
	await revokeSessions(id, "admin-terminated");
	await logAction(actorId, "USER_SESSIONS_TERMINATED", "USER", id);
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const analytics = async (query: AdminAnalyticsQuery) => {
	const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

	const [issues, users] = await Promise.all([
		prisma.issue.findMany({
			where: { createdAt: { gte: since } },
			select: {
				createdAt: true,
				category: true,
				status: true,
				priority: true,
				resolvedAt: true,
			},
		}),
		prisma.user.findMany({
			where: { createdAt: { gte: since } },
			select: { createdAt: true },
		}),
	]);

	const issuesByDay = new Map<string, number>();
	const usersByDay = new Map<string, number>();
	const categories = new Map<string, number>();
	let resolved = 0;
	let pending = 0;
	let highPriority = 0;
	let resolutionHours = 0;
	let resolutionCount = 0;

	for (const issue of issues) {
		issuesByDay.set(
			dayKey(issue.createdAt),
			(issuesByDay.get(dayKey(issue.createdAt)) ?? 0) + 1,
		);
		categories.set(issue.category, (categories.get(issue.category) ?? 0) + 1);
		if (issue.status === "RESOLVED") resolved += 1;
		if (issue.status === "PENDING") pending += 1;
		if (issue.priority === "HIGH") highPriority += 1;
		if (issue.resolvedAt) {
			resolutionHours +=
				(issue.resolvedAt.getTime() - issue.createdAt.getTime()) /
				(60 * 60 * 1000);
			resolutionCount += 1;
		}
	}

	for (const user of users) {
		usersByDay.set(
			dayKey(user.createdAt),
			(usersByDay.get(dayKey(user.createdAt)) ?? 0) + 1,
		);
	}

	return {
		days: query.days,
		totalIssues: issues.length,
		resolved,
		pending,
		highPriority,
		resolutionRate: issues.length
			? Math.round((resolved / issues.length) * 100)
			: 0,
		averageResolutionHours: resolutionCount
			? Math.round((resolutionHours / resolutionCount) * 10) / 10
			: 0,
		newUsers: users.length,
		issuesByDay: [...issuesByDay.entries()].map(([date, count]) => ({
			date,
			count,
		})),
		usersByDay: [...usersByDay.entries()].map(([date, count]) => ({
			date,
			count,
		})),
		categories: [...categories.entries()].map(([category, count]) => ({
			category,
			count,
		})),
	};
};

const activity = async (query: AdminActivityQuery) => {
	const [items, total] = await Promise.all([
		prisma.adminActionLog.findMany({
			orderBy: { createdAt: "desc" },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			select: {
				id: true,
				action: true,
				targetType: true,
				targetId: true,
				metadata: true,
				createdAt: true,
				actor: {
					select: { id: true, name: true, email: true, role: true },
				},
			},
		}),
		prisma.adminActionLog.count(),
	]);

	return {
		items,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit) || 0,
		},
	};
};

const listFlags = async (query: ModerationFlagsQuery) => {
	const where: Prisma.ModerationFlagWhereInput = query.status
		? { status: query.status }
		: {};

	const [items, total] = await Promise.all([
		prisma.moderationFlag.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			select: {
				id: true,
				reason: true,
				status: true,
				action: true,
				resolutionNote: true,
				createdAt: true,
				resolvedAt: true,
				issue: {
					select: {
						id: true,
						title: true,
						category: true,
						status: true,
						moderationStatus: true,
					},
				},
				reporter: { select: { id: true, name: true, email: true } },
				resolvedBy: { select: { id: true, name: true } },
			},
		}),
		prisma.moderationFlag.count({ where }),
	]);

	return {
		items,
		meta: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages: Math.ceil(total / query.limit) || 0,
		},
	};
};

const createFlag = async (actorId: string, input: CreateFlagInput) => {
	const issue = await prisma.issue.findUnique({
		where: { id: input.issueId },
		select: { id: true, moderationStatus: true },
	});

	if (!issue || issue.moderationStatus === "HIDDEN") {
		throw AppError.notFound("Issue not found.");
	}

	const existing = await prisma.moderationFlag.findFirst({
		where: { issueId: input.issueId, reporterId: actorId, status: "PENDING" },
		select: { id: true },
	});

	if (existing) {
		throw AppError.badRequest(
			"You already have a pending report for this issue.",
		);
	}

	const flag = await prisma.moderationFlag.create({
		data: { issueId: input.issueId, reporterId: actorId, reason: input.reason },
	});

	await logAction(actorId, "MODERATION_FLAG_CREATED", "ISSUE", input.issueId);

	return flag;
};

const resolveFlag = async (
	actorId: string,
	id: string,
	input: ResolveFlagInput,
) => {
	const flag = await prisma.moderationFlag.findUnique({
		where: { id },
		select: { id: true, issueId: true },
	});

	if (!flag) {
		throw AppError.notFound("Moderation report not found.");
	}

	const updated = await prisma.moderationFlag.update({
		where: { id },
		data: {
			status: input.status,
			action: input.action,
			resolutionNote: input.note,
			resolvedById: actorId,
			resolvedAt: new Date(),
		},
	});

	if (input.action === "HIDE" || input.action === "APPROVE") {
		await prisma.issue.update({
			where: { id: flag.issueId },
			data: {
				moderationStatus: input.action === "HIDE" ? "HIDDEN" : "VISIBLE",
			},
		});
		await invalidateIssueCaches();
	}

	await logAction(actorId, "MODERATION_FLAG_RESOLVED", "ISSUE", flag.issueId, {
		status: input.status,
		action: input.action,
	});

	return updated;
};

const listSettings = async () =>
	prisma.appSetting.findMany({
		orderBy: { key: "asc" },
		select: { key: true, value: true, updatedAt: true },
	});

const updateSetting = async (actorId: string, input: AppSettingInput) => {
	const setting = await prisma.appSetting.upsert({
		where: { key: input.key },
		create: { key: input.key, value: input.value, updatedById: actorId },
		update: { value: input.value, updatedById: actorId },
		select: { key: true, value: true, updatedAt: true },
	});

	await logAction(actorId, "APP_SETTING_UPDATED", "APP_SETTING", input.key);

	return setting;
};

export const AdminService = {
	listUsers,
	updateUserImage,
	removeUserImage,
	changeRole,
	changeStatus,
	deleteUser,
	resetPassword,
	terminateSessions,
	analytics,
	activity,
	listFlags,
	createFlag,
	resolveFlag,
	listSettings,
	updateSetting,
};
