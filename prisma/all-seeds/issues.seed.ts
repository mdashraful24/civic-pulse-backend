import type {
	IssueCategory,
	IssuePriority,
	IssueStatus,
} from "../../generated/prisma/enums";
import config from "../../src/app/config";
import { prisma } from "../../src/app/lib/prisma";
import type { SeedIssuesResult } from "./seed.types";

type SeedHistory = {
	id: string;
	changedByEmail: string;
	oldStatus: IssueStatus | null;
	newStatus: IssueStatus;
	note: string | null;
	createdAt: Date;
};

type SeedIssue = {
	id: string;
	title: string;
	description: string;
	category: IssueCategory;
	location: string;
	imageUrl: string | null;
	priority: IssuePriority;
	status: IssueStatus;
	reporterEmail: string;
	assigneeEmail: string | null;
	resolutionNote: string | null;
	resolvedAt: Date | null;
	createdAt: Date;
	history: SeedHistory[];
};

const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

const demoIssues = (): SeedIssue[] => [
	{
		id: "9f1c2a10-0001-4a01-8b01-000000000001",
		title: "Large pothole on Main Road",
		description:
			"A deep pothole has formed near the bus stop on Main Road. It fills with water when it rains and is difficult to see at night.",
		category: "ROADS",
		location: "Main Road, near the central bus stop",
		imageUrl: "https://picsum.photos/seed/civicpulse-pothole/800/600",
		priority: "HIGH",
		status: "PENDING",
		reporterEmail: config.seed_citizen_email,
		assigneeEmail: null,
		resolutionNote: null,
		resolvedAt: null,
		createdAt: daysAgo(2),
		history: [
			{
				id: "9f1c2a10-1001-4a01-8b01-000000000001",
				changedByEmail: config.seed_citizen_email,
				oldStatus: null,
				newStatus: "PENDING",
				note: "Issue reported.",
				createdAt: daysAgo(2),
			},
		],
	},
	{
		id: "9f1c2a10-0002-4a01-8b01-000000000002",
		title: "Streetlight not working near Central Park",
		description:
			"The streetlight at the north entrance of Central Park has been dark for several nights, making the footpath unsafe for pedestrians.",
		category: "STREETLIGHTS",
		location: "North entrance, Central Park",
		imageUrl: null,
		priority: "MEDIUM",
		status: "IN_PROGRESS",
		reporterEmail: config.seed_citizen_email,
		assigneeEmail: config.seed_personnel_email,
		resolutionNote: null,
		resolvedAt: null,
		createdAt: daysAgo(6),
		history: [
			{
				id: "9f1c2a10-1002-4a01-8b01-000000000002",
				changedByEmail: config.seed_citizen_email,
				oldStatus: null,
				newStatus: "PENDING",
				note: "Issue reported.",
				createdAt: daysAgo(6),
			},
			{
				id: "9f1c2a10-1003-4a01-8b01-000000000003",
				changedByEmail: config.seed_personnel_email,
				oldStatus: "PENDING",
				newStatus: "IN_PROGRESS",
				note: "Replacement lamp ordered and site inspected.",
				createdAt: daysAgo(4),
			},
		],
	},
	{
		id: "9f1c2a10-0003-4a01-8b01-000000000003",
		title: "Water pipe leaking on Elm Street",
		description:
			"A burst pipe is leaking clean water onto the road on Elm Street. The leak has been running continuously for two days.",
		category: "WATER",
		location: "Elm Street, opposite house 42",
		imageUrl: "https://picsum.photos/seed/civicpulse-water-leak/800/600",
		priority: "HIGH",
		status: "RESOLVED",
		reporterEmail: config.seed_citizen_email,
		assigneeEmail: config.seed_personnel_email,
		resolutionNote:
			"Leaking section was replaced and the road surface was restored.",
		resolvedAt: daysAgo(8),
		createdAt: daysAgo(12),
		history: [
			{
				id: "9f1c2a10-1004-4a01-8b01-000000000004",
				changedByEmail: config.seed_citizen_email,
				oldStatus: null,
				newStatus: "PENDING",
				note: "Issue reported.",
				createdAt: daysAgo(12),
			},
			{
				id: "9f1c2a10-1005-4a01-8b01-000000000005",
				changedByEmail: config.seed_admin_email,
				oldStatus: "PENDING",
				newStatus: "IN_PROGRESS",
				note: "Assigned to the water maintenance team.",
				createdAt: daysAgo(10),
			},
			{
				id: "9f1c2a10-1006-4a01-8b01-000000000006",
				changedByEmail: config.seed_personnel_email,
				oldStatus: "IN_PROGRESS",
				newStatus: "RESOLVED",
				note: "Leaking section was replaced and the road surface was restored.",
				createdAt: daysAgo(8),
			},
		],
	},
	{
		id: "9f1c2a10-0004-4a01-8b01-000000000004",
		title: "Overflowing bins at Market Square",
		description:
			"The public bins beside the Market Square entrance have not been collected for several days and waste is spilling onto the pavement.",
		category: "WASTE",
		location: "Market Square, east entrance",
		imageUrl: null,
		priority: "LOW",
		status: "PENDING",
		reporterEmail: config.seed_citizen_email,
		assigneeEmail: null,
		resolutionNote: null,
		resolvedAt: null,
		createdAt: daysAgo(1),
		history: [
			{
				id: "9f1c2a10-1007-4a01-8b01-000000000007",
				changedByEmail: config.seed_citizen_email,
				oldStatus: null,
				newStatus: "PENDING",
				note: "Issue reported.",
				createdAt: daysAgo(1),
			},
		],
	},
	{
		id: "9f1c2a10-0005-4a01-8b01-000000000005",
		title: "Damaged bench in Riverside Park",
		description:
			"One of the wooden benches along the riverside walking path has a broken backrest and exposed screws.",
		category: "OTHER",
		location: "Riverside Park walking path",
		imageUrl: null,
		priority: "MEDIUM",
		status: "RESOLVED",
		reporterEmail: config.seed_citizen_email,
		assigneeEmail: config.seed_personnel_email,
		resolutionNote: "The damaged bench was removed and replaced.",
		resolvedAt: daysAgo(15),
		createdAt: daysAgo(20),
		history: [
			{
				id: "9f1c2a10-1008-4a01-8b01-000000000008",
				changedByEmail: config.seed_citizen_email,
				oldStatus: null,
				newStatus: "PENDING",
				note: "Issue reported.",
				createdAt: daysAgo(20),
			},
			{
				id: "9f1c2a10-1009-4a01-8b01-000000000009",
				changedByEmail: config.seed_admin_email,
				oldStatus: "PENDING",
				newStatus: "IN_PROGRESS",
				note: "Park maintenance team notified.",
				createdAt: daysAgo(18),
			},
			{
				id: "9f1c2a10-1010-4a01-8b01-000000000010",
				changedByEmail: config.seed_personnel_email,
				oldStatus: "IN_PROGRESS",
				newStatus: "RESOLVED",
				note: "The damaged bench was removed and replaced.",
				createdAt: daysAgo(15),
			},
		],
	},
];

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const seedIssues = async (): Promise<SeedIssuesResult> => {
	const emails = [
		config.seed_admin_email,
		config.seed_personnel_email,
		config.seed_citizen_email,
	].map(normalizeEmail);

	const users = await prisma.user.findMany({
		where: { email: { in: emails }, isDeleted: false },
		select: { id: true, email: true },
	});

	const userIdByEmail = new Map(
		users.map((user) => [normalizeEmail(user.email), user.id]),
	);

	let created = 0;
	let existing = 0;
	let skipped = 0;

	for (const demo of demoIssues()) {
		const reporterId = userIdByEmail.get(normalizeEmail(demo.reporterEmail));

		if (!reporterId) {
			skipped += 1;
			continue;
		}

		const current = await prisma.issue.findUnique({
			where: { id: demo.id },
			select: { id: true },
		});

		if (current) {
			existing += 1;
			continue;
		}

		const assigneeId = demo.assigneeEmail
			? (userIdByEmail.get(normalizeEmail(demo.assigneeEmail)) ?? null)
			: null;

		const history = demo.history
			.map((entry) => {
				const changedById = userIdByEmail.get(
					normalizeEmail(entry.changedByEmail),
				);

				if (!changedById) return null;

				return {
					id: entry.id,
					issueId: demo.id,
					changedById,
					oldStatus: entry.oldStatus,
					newStatus: entry.newStatus,
					note: entry.note,
					createdAt: entry.createdAt,
				};
			})
			.filter((entry) => entry !== null);

		await prisma.$transaction(async (tx) => {
			await tx.issue.create({
				data: {
					id: demo.id,
					title: demo.title,
					description: demo.description,
					category: demo.category,
					location: demo.location,
					imageUrl: demo.imageUrl,
					priority: demo.priority,
					status: demo.status,
					reporterId,
					assigneeId,
					resolutionNote: demo.resolutionNote,
					resolvedAt: demo.resolvedAt,
					createdAt: demo.createdAt,
				},
			});

			if (history.length > 0) {
				await tx.issueHistory.createMany({ data: history });
			}
		});

		created += 1;
	}

	return { created, existing, skipped };
};
