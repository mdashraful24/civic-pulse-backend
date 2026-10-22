import type { Prisma } from "../../../../generated/prisma/client";
import {
	deleteCloudinaryImage,
	uploadImageToCloudinary,
} from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { AdminUsersQuery } from "./admin.validation";

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

	return updated;
};

const removeUserImage = async (id: string): Promise<void> => {
	const current = await loadUserForChange(id);

	await prisma.user.update({
		where: { id },
		data: { imageUrl: null, imagePublicId: null },
	});

	await deleteCloudinaryImage(current.imagePublicId);
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

	const [items, total] = await prisma.$transaction([
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

export const AdminService = {
	listUsers,
	updateUserImage,
	removeUserImage,
};
