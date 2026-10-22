import { z } from "zod";

export const adminUsersQuerySchema = z.object({
	search: z
		.string()
		.trim()
		.max(120, "Search must not exceed 120 characters.")
		.optional(),
	role: z.enum(["CITIZEN", "ADMIN", "PERSONNEL"]).optional(),
	status: z.enum(["ACTIVE", "BLOCKED", "DELETED"]).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserParamsSchema = z.object({
	id: z.uuid({ message: "A valid user id is required." }),
});
