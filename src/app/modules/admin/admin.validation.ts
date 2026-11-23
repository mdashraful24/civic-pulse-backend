import { z } from "zod";
import { BCRYPT_MAX_BYTES } from "../../utils/password";
import { sanitizedString } from "../../utils/sanitizedString";

const roleSchema = z.enum(["CITIZEN", "ADMIN", "PERSONNEL"]);
const activeUserStatusSchema = z.enum(["ACTIVE", "BLOCKED"]);

export const adminUsersQuerySchema = z.object({
	search: sanitizedString(
		z.string().trim().max(120, "Search must not exceed 120 characters."),
	).optional(),
	role: roleSchema.optional(),
	status: z.enum(["ACTIVE", "BLOCKED", "DELETED"]).optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminUserParamsSchema = z.object({
	id: z.uuid({ message: "A valid user id is required." }),
});

export const adminFlagParamsSchema = adminUserParamsSchema;

const adminUserNameSchema = sanitizedString(
	z
		.string()
		.trim()
		.min(2, "Name must be at least 2 characters long.")
		.max(80, "Name must not exceed 80 characters."),
);
const adminUserEmailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.min(1, "Email is required.")
	.max(254, "Email must not exceed 254 characters.")
	.pipe(z.email({ message: "Please provide a valid email address." }));
const adminUserPasswordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters long.")
	.max(128, "Password must not exceed 128 characters.")
	.refine(
		(value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_BYTES,
		`Password must not exceed ${BCRYPT_MAX_BYTES} bytes.`,
	)
	.regex(/[A-Za-z]/, "Password must contain at least one letter.")
	.regex(/\d/, "Password must contain at least one number.");

export const createAdminUserSchema = z.strictObject({
	name: adminUserNameSchema,
	email: adminUserEmailSchema,
	password: adminUserPasswordSchema,
	role: roleSchema.default("CITIZEN"),
	status: activeUserStatusSchema.default("ACTIVE"),
});

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;

export const updateAdminUserSchema = z
	.strictObject({
		name: adminUserNameSchema.optional(),
		email: adminUserEmailSchema.optional(),
		password: adminUserPasswordSchema.optional(),
		role: roleSchema.optional(),
		status: activeUserStatusSchema.optional(),
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: "Provide at least one field to update.",
	});

export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;

export const changeRoleSchema = z.object({
	role: roleSchema,
});

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const changeStatusSchema = z.object({
	status: activeUserStatusSchema,
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

const flagStatusSchema = z.enum(["PENDING", "RESOLVED", "DISMISSED"]);
const flagActionSchema = z.enum(["NONE", "HIDE", "APPROVE"]);

export const createFlagSchema = z.object({
	issueId: z.uuid({ message: "A valid issue id is required." }),
	reason: sanitizedString(
		z
			.string()
			.trim()
			.min(5, "Describe the problem in at least 5 characters.")
			.max(500, "Reason must not exceed 500 characters."),
	),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;

export const resolveFlagSchema = z.object({
	status: flagStatusSchema,
	action: flagActionSchema.default("NONE"),
	note: sanitizedString(z.string().trim().max(300)).optional(),
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
	value: sanitizedString(z.string().trim().max(2000)),
});

export type AppSettingInput = z.infer<typeof appSettingSchema>;
