import { z } from "zod";

const issueCategorySchema = z.enum([
	"ROADS",
	"STREETLIGHTS",
	"WATER",
	"WASTE",
	"OTHER",
]);

const issuePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const issueStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "RESOLVED"]);

const idSchema = z.uuid({ message: "A valid issue id is required." });

const imageUrlSchema = z
	.string()
	.trim()
	.max(2048, "Image URL must not exceed 2048 characters.")
	.pipe(z.url({ message: "Image URL must be a valid URL." }))
	.refine((value) => /^https?:\/\//i.test(value), {
		message: "Image URL must start with http:// or https://.",
	});

export const createIssueSchema = z.strictObject({
	title: z
		.string()
		.trim()
		.min(3, "Title must be at least 3 characters long.")
		.max(150, "Title must not exceed 150 characters."),
	description: z
		.string()
		.trim()
		.min(10, "Description must be at least 10 characters long.")
		.max(5000, "Description must not exceed 5000 characters."),
	category: issueCategorySchema,
	location: z
		.string()
		.trim()
		.min(3, "Location must be at least 3 characters long.")
		.max(200, "Location must not exceed 200 characters."),
	imageUrl: imageUrlSchema.optional(),
	priority: issuePrioritySchema.default("MEDIUM"),
});

export const updateIssueSchema = z
	.strictObject({
		title: z
			.string()
			.trim()
			.min(3, "Title must be at least 3 characters long.")
			.max(150, "Title must not exceed 150 characters.")
			.optional(),
		description: z
			.string()
			.trim()
			.min(10, "Description must be at least 10 characters long.")
			.max(5000, "Description must not exceed 5000 characters.")
			.optional(),
		category: issueCategorySchema.optional(),
		location: z
			.string()
			.trim()
			.min(3, "Location must be at least 3 characters long.")
			.max(200, "Location must not exceed 200 characters.")
			.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "Provide at least one field to update.",
	});

export const issueListQuerySchema = z.object({
	search: z
		.string()
		.trim()
		.max(120, "Search must not exceed 120 characters.")
		.optional(),
	category: issueCategorySchema.optional(),
	priority: issuePrioritySchema.optional(),
	status: issueStatusSchema.optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(10),
	sort: z.enum(["newest", "oldest"]).default("newest"),
});

export const issueIdParamsSchema = z.object({
	id: idSchema,
});

export const assignIssueSchema = z.strictObject({
	personnelId: z
		.uuid({ message: "A valid personnel id is required." })
		.nullable(),
});

export const updateIssueStatusSchema = z.strictObject({
	status: issueStatusSchema,
	resolutionNote: z
		.string()
		.trim()
		.max(2000, "Resolution note must not exceed 2000 characters.")
		.optional(),
});

export const updateIssuePrioritySchema = z.strictObject({
	priority: issuePrioritySchema,
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type IssueListQuery = z.infer<typeof issueListQuerySchema>;
export type AssignIssueInput = z.infer<typeof assignIssueSchema>;
export type UpdateIssueStatusInput = z.infer<typeof updateIssueStatusSchema>;
export type UpdateIssuePriorityInput = z.infer<
	typeof updateIssuePrioritySchema
>;
