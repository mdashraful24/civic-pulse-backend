import type { Prisma } from "../../../../generated/prisma/client";

export const PUBLIC_ISSUE_SELECT = {
	id: true,
	title: true,
	description: true,
	category: true,
	location: true,
	imageUrl: true,
	priority: true,
	status: true,
	resolutionNote: true,
	resolvedAt: true,
	createdAt: true,
	updatedAt: true,
	reporter: {
		select: {
			id: true,
			name: true,
			imageUrl: true,
		},
	},
	assignee: {
		select: {
			id: true,
			name: true,
			imageUrl: true,
		},
	},
} as const satisfies Prisma.IssueSelect;

export type PublicIssue = Prisma.IssueGetPayload<{
	select: typeof PUBLIC_ISSUE_SELECT;
}>;

export const ISSUE_HISTORY_SELECT = {
	id: true,
	oldStatus: true,
	newStatus: true,
	note: true,
	createdAt: true,
	changedBy: {
		select: {
			id: true,
			name: true,
			role: true,
		},
	},
} as const satisfies Prisma.IssueHistorySelect;

export type PublicIssueHistory = Prisma.IssueHistoryGetPayload<{
	select: typeof ISSUE_HISTORY_SELECT;
}>;

export type IssueListResult<T> = {
	items: T[];
	meta: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
};
