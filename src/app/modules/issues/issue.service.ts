import type { Prisma } from "../../../../generated/prisma/client";
import {
	deleteCloudinaryImage,
	uploadImageToCloudinary,
} from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import type { AuthUser } from "../../middlewares/auth";
import { AppError } from "../../utils/AppError";
import {
	ISSUE_HISTORY_SELECT,
	type IssueListResult,
	PUBLIC_ISSUE_SELECT,
	type PublicIssue,
	type PublicIssueHistory,
} from "./issue.interface";
import type {
	AssignIssueInput,
	CreateIssueInput,
	IssueListQuery,
	UpdateIssueInput,
	UpdateIssuePriorityInput,
	UpdateIssueStatusInput,
} from "./issue.validation";

const meta = (
	total: number,
	page: number,
	limit: number,
): IssueListResult<never>["meta"] => ({
	page,
	limit,
	total,
	totalPages: Math.ceil(total / limit) || 0,
});

const buildWhere = (query: IssueListQuery): Prisma.IssueWhereInput => {
	const where: Prisma.IssueWhereInput = {};

	if (query.search) {
		where.title = { contains: query.search, mode: "insensitive" };
	}
	if (query.category) where.category = query.category;
	if (query.priority) where.priority = query.priority;
	if (query.status) where.status = query.status;

	return where;
};

const findPage = async (
	where: Prisma.IssueWhereInput,
	query: IssueListQuery,
) => {
	const [items, total] = await Promise.all([
		prisma.issue.findMany({
			where,
			select: PUBLIC_ISSUE_SELECT,
			orderBy: { createdAt: query.sort === "oldest" ? "asc" : "desc" },
			skip: (query.page - 1) * query.limit,
			take: query.limit,
		}),
		prisma.issue.count({ where }),
	]);

	return {
		items,
		meta: meta(total, query.page, query.limit),
	};
};

const list = async (
	query: IssueListQuery,
): Promise<IssueListResult<PublicIssue>> => {
	return findPage(buildWhere(query), query);
};

const listMine = async (
	userId: string,
	query: IssueListQuery,
): Promise<IssueListResult<PublicIssue>> => {
	return findPage({ ...buildWhere(query), reporterId: userId }, query);
};

const listAssigned = async (
	userId: string,
	query: IssueListQuery,
): Promise<IssueListResult<PublicIssue>> => {
	return findPage({ ...buildWhere(query), assigneeId: userId }, query);
};

const getById = async (id: string): Promise<PublicIssue> => {
	const issue = await prisma.issue.findUnique({
		where: { id },
		select: PUBLIC_ISSUE_SELECT,
	});

	if (!issue) {
		throw AppError.notFound("Issue not found.");
	}

	return issue;
};

const history = async (id: string): Promise<PublicIssueHistory[]> => {
	const issue = await prisma.issue.findUnique({
		where: { id },
		select: { id: true },
	});

	if (!issue) {
		throw AppError.notFound("Issue not found.");
	}

	return prisma.issueHistory.findMany({
		where: { issueId: id },
		select: ISSUE_HISTORY_SELECT,
		orderBy: { createdAt: "asc" },
	});
};

const create = async (
	userId: string,
	payload: CreateIssueInput,
	imageBuffer?: Buffer,
): Promise<PublicIssue> => {
	const uploaded = imageBuffer
		? await uploadImageToCloudinary(imageBuffer, "civicpulse/issues")
		: null;

	try {
		return await prisma.$transaction(async (tx) => {
			const issue = await tx.issue.create({
				data: {
					title: payload.title,
					description: payload.description,
					category: payload.category,
					location: payload.location,
					imageUrl: uploaded?.secure_url ?? payload.imageUrl ?? null,
					imagePublicId: uploaded?.public_id ?? null,
					priority: payload.priority,
					reporterId: userId,
				},
				select: PUBLIC_ISSUE_SELECT,
			});

			await tx.issueHistory.create({
				data: {
					issueId: issue.id,
					changedById: userId,
					newStatus: "PENDING",
					note: "Issue reported.",
				},
			});

			return issue;
		});
	} catch (error) {
		if (uploaded) await deleteCloudinaryImage(uploaded.public_id);
		throw error;
	}
};

const loadIssueForChange = async (id: string) => {
	const issue = await prisma.issue.findUnique({
		where: { id },
		select: {
			id: true,
			reporterId: true,
			assigneeId: true,
			status: true,
			resolutionNote: true,
			imagePublicId: true,
		},
	});

	if (!issue) {
		throw AppError.notFound("Issue not found.");
	}

	return issue;
};

const update = async (
	user: AuthUser,
	id: string,
	payload: UpdateIssueInput,
): Promise<PublicIssue> => {
	const issue = await loadIssueForChange(id);

	const isAdmin = user.role === "ADMIN";
	const isOwner = issue.reporterId === user.id;
	const isEditable = issue.status === "PENDING";

	if (!isAdmin && !(isOwner && isEditable)) {
		throw AppError.forbidden(
			"You can only edit your own reports while they are pending.",
		);
	}

	return prisma.issue.update({
		where: { id },
		data: {
			title: payload.title,
			description: payload.description,
			category: payload.category,
			location: payload.location,
		},
		select: PUBLIC_ISSUE_SELECT,
	});
};

const updateImage = async (
	user: AuthUser,
	id: string,
	buffer: Buffer,
): Promise<PublicIssue> => {
	const issue = await loadIssueForChange(id);

	const isAdmin = user.role === "ADMIN";
	const isOwner = issue.reporterId === user.id;
	const isEditable = issue.status === "PENDING";

	if (!isAdmin && !(isOwner && isEditable)) {
		throw AppError.forbidden(
			"You can only change the photo of your own report while it is pending.",
		);
	}

	const uploaded = await uploadImageToCloudinary(buffer, "civicpulse/issues");

	let updated: PublicIssue;

	try {
		updated = await prisma.issue.update({
			where: { id },
			data: {
				imageUrl: uploaded.secure_url,
				imagePublicId: uploaded.public_id,
			},
			select: PUBLIC_ISSUE_SELECT,
		});
	} catch (error) {
		await deleteCloudinaryImage(uploaded.public_id);
		throw error;
	}

	await deleteCloudinaryImage(issue.imagePublicId);

	return updated;
};

const remove = async (user: AuthUser, id: string): Promise<void> => {
	const issue = await loadIssueForChange(id);

	const isAdmin = user.role === "ADMIN";
	const isOwner = issue.reporterId === user.id;
	const isDeletable = issue.status === "PENDING";

	if (!isAdmin && !(isOwner && isDeletable)) {
		throw AppError.forbidden(
			"You can only delete your own reports while they are pending.",
		);
	}

	await prisma.issue.delete({ where: { id } });
	await deleteCloudinaryImage(issue.imagePublicId);
};

const assign = async (
	id: string,
	payload: AssignIssueInput,
): Promise<PublicIssue> => {
	await loadIssueForChange(id);

	if (payload.personnelId) {
		const personnel = await prisma.user.findFirst({
			where: {
				id: payload.personnelId,
				role: "PERSONNEL",
				status: "ACTIVE",
				isDeleted: false,
			},
			select: { id: true },
		});

		if (!personnel) {
			throw AppError.badRequest(
				"The selected user is not an active personnel account.",
			);
		}
	}

	return prisma.issue.update({
		where: { id },
		data: { assigneeId: payload.personnelId },
		select: PUBLIC_ISSUE_SELECT,
	});
};

const PERSONNEL_TRANSITIONS: Record<string, string[]> = {
	PENDING: ["IN_PROGRESS"],
	IN_PROGRESS: ["RESOLVED"],
	RESOLVED: [],
};

const changeStatus = async (
	user: AuthUser,
	id: string,
	payload: UpdateIssueStatusInput,
): Promise<PublicIssue> => {
	const issue = await loadIssueForChange(id);

	if (user.role === "CITIZEN") {
		throw AppError.forbidden("Citizens cannot change the status of an issue.");
	}

	if (user.role === "PERSONNEL") {
		if (issue.assigneeId !== user.id) {
			throw AppError.forbidden(
				"Only the assigned personnel can update this issue.",
			);
		}

		const allowed = PERSONNEL_TRANSITIONS[issue.status] ?? [];
		if (!allowed.includes(payload.status)) {
			throw AppError.badRequest(
				`Personnel cannot change the status from ${issue.status} to ${payload.status}.`,
			);
		}
	}

	if (issue.status === payload.status) {
		throw AppError.badRequest(`The issue is already ${payload.status}.`);
	}

	const now = new Date();
	const isResolved = payload.status === "RESOLVED";

	return prisma.$transaction(async (tx) => {
		const updated = await tx.issue.update({
			where: { id },
			data: {
				status: payload.status,
				resolvedAt: isResolved ? now : null,
				resolutionNote: isResolved
					? (payload.resolutionNote ?? issue.resolutionNote ?? null)
					: null,
			},
			select: PUBLIC_ISSUE_SELECT,
		});

		await tx.issueHistory.create({
			data: {
				issueId: id,
				changedById: user.id,
				oldStatus: issue.status,
				newStatus: payload.status,
				note: payload.resolutionNote ?? null,
			},
		});

		return updated;
	});
};

const changePriority = async (
	id: string,
	payload: UpdateIssuePriorityInput,
): Promise<PublicIssue> => {
	await loadIssueForChange(id);

	return prisma.issue.update({
		where: { id },
		data: { priority: payload.priority },
		select: PUBLIC_ISSUE_SELECT,
	});
};

const stats = async (user: AuthUser) => {
	const scope: Prisma.IssueWhereInput =
		user.role === "ADMIN"
			? {}
			: user.role === "PERSONNEL"
				? { assigneeId: user.id }
				: { reporterId: user.id };

	const [total, pending, inProgress, resolved, highPriority, recentIssues] =
		await Promise.all([
			prisma.issue.count({ where: scope }),
			prisma.issue.count({ where: { ...scope, status: "PENDING" } }),
			prisma.issue.count({ where: { ...scope, status: "IN_PROGRESS" } }),
			prisma.issue.count({ where: { ...scope, status: "RESOLVED" } }),
			prisma.issue.count({ where: { ...scope, priority: "HIGH" } }),
			prisma.issue.findMany({
				where: scope,
				select: PUBLIC_ISSUE_SELECT,
				orderBy: { createdAt: "desc" },
				take: 5,
			}),
		]);

	return {
		scope:
			user.role === "ADMIN"
				? "ALL"
				: user.role === "PERSONNEL"
					? "ASSIGNED"
					: "OWN",
		total,
		pending,
		inProgress,
		resolved,
		highPriority,
		statusDistribution: {
			PENDING: pending,
			IN_PROGRESS: inProgress,
			RESOLVED: resolved,
		},
		recentIssues,
	};
};

export const IssueService = {
	list,
	listMine,
	listAssigned,
	getById,
	history,
	create,
	update,
	updateImage,
	remove,
	assign,
	changeStatus,
	changePriority,
	stats,
};
