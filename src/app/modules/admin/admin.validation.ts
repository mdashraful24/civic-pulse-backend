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

export const adminFlagParamsSchema = adminUserParamsSchema;

export const changeRoleSchema = z.object({
	role: z.enum(["CITIZEN", "ADMIN", "PERSONNEL"]),
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const changeStatusSchema = z.object({
	status: z.enum(["ACTIVE", "BLOCKED"]),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

const flagStatusSchema = z.enum(["PENDING", "RESOLVED", "DISMISSED"]);
const flagActionSchema = z.enum(["NONE", "HIDE", "APPROVE"]);

export const createFlagSchema = z.object({
	issueId: z.uuid({ message: "A valid issue id is required." }),
	reason: z
		.string()
		.trim()
		.min(5, "Describe the problem in at least 5 characters.")
		.max(500, "Reason must not exceed 500 characters."),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const resolveFlagSchema = z.object({
	status: flagStatusSchema,
	action: flagActionSchema.default("NONE"),
	note: z.string().trim().max(300).optional(),
});

export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;

export const moderationFlagsQuerySchema = z.object({
	status: flagStatusSchema.optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ModerationFlagsQuery = z.infer<typeof moderationFlagsQuerySchema>;

export const adminActivityQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminActivityQuery = z.infer<typeof adminActivityQuerySchema>;

export const adminAnalyticsQuerySchema = z.object({
	days: z.coerce
		.number()
		.int()
		.refine((value) => [7, 30, 90].includes(value), {
			message: "Days must be 7, 30 or 90.",
		})
		.default(30),
});

export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;

export const appSettingSchema = z.object({
	key: z
		.string()
		.trim()
		.min(2)
		.max(60)
		.regex(
			/^[a-z][a-z0-9_.-]*$/,
			"Use lowercase letters, numbers, dots, dashes or underscores.",
		),
	value: z.string().trim().max(2000),
});

export type AppSettingInput = z.infer<typeof appSettingSchema>;
