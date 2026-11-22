import { z } from "zod";

const categorySchema = z.enum([
	"ROADS",
	"STREETLIGHTS",
	"WATER",
	"WASTE",
	"OTHER",
]);

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const titleSchema = z
	.string()
	.trim()
	.min(3, "Title must be at least 3 characters long.")
	.max(150, "Title must not exceed 150 characters.");

const descriptionSchema = z
	.string()
	.trim()
	.min(10, "Description must be at least 10 characters long.")
	.max(5000, "Description must not exceed 5000 characters.");

const idSchema = z.uuid({ message: "A valid id is required." });

export const aiCategorizeSchema = z.strictObject({
	title: titleSchema,
	description: descriptionSchema,
});

export const aiPrioritizeSchema = z.strictObject({
	title: titleSchema,
	description: descriptionSchema,
	category: categorySchema.optional(),
	location: z.string().trim().max(200).optional(),
});

export const aiSummarizeSchema = z
	.strictObject({
		issueId: idSchema.optional(),
		text: z
			.string()
			.trim()
			.min(10, "Text must be at least 10 characters long.")
			.max(10000, "Text must not exceed 10000 characters.")
			.optional(),
	})
	.refine((data) => Boolean(data.issueId || data.text), {
		message: "Provide either issueId or text.",
	});

export const aiDuplicateSchema = z.strictObject({
	title: titleSchema,
	description: descriptionSchema,
	excludeId: idSchema.optional(),
	limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const aiSearchQuerySchema = z.object({
	q: z
		.string()
		.trim()
		.min(2, "Search query must be at least 2 characters long.")
		.max(120, "Search query must not exceed 120 characters."),
	limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const aiTriageSchema = z.strictObject({
	title: titleSchema,
	description: descriptionSchema,
	category: categorySchema.optional(),
	location: z.string().trim().max(200).optional(),
	issueId: idSchema.optional(),
});

export const aiIssueIdParamsSchema = z.object({ id: idSchema });

export const aiAssigneeSchema = z.strictObject({ issueId: idSchema });

export const remoteCategorizeSchema = z.strictObject({
	category: categorySchema,
	confidence: z.number().min(0).max(1),
	keywords: z.array(z.string().trim().min(1).max(40)).max(8),
	rationale: z.string().trim().min(1).max(300),
});

export const remotePrioritizeSchema = z.strictObject({
	priority: prioritySchema,
	urgencyScore: z.number().int().min(0).max(100),
	reasons: z.array(z.string().trim().min(1).max(200)).max(5),
});

export const remoteSummarizeSchema = z.strictObject({
	summary: z.string().trim().min(10).max(600),
	keyPoints: z.array(z.string().trim().min(1).max(60)).max(8),
});

export const remoteTriageSchema = z.strictObject({
	category: categorySchema,
	priority: prioritySchema,
	urgencyScore: z.number().int().min(0).max(100),
	summary: z.string().trim().min(10).max(600),
	rationale: z.string().trim().min(1).max(500),
	actions: z
		.array(
			z.strictObject({
				type: z.enum(["SET_CATEGORY", "SET_PRIORITY", "ASSIGN", "ADD_NOTE"]),
				value: z.string().trim().min(1).max(200),
				reason: z.string().trim().min(1).max(200),
			}),
		)
		.max(6),
});

export type AiCategorizeInput = z.infer<typeof aiCategorizeSchema>;
export type AiPrioritizeInput = z.infer<typeof aiPrioritizeSchema>;
export type AiSummarizeInput = z.infer<typeof aiSummarizeSchema>;
export type AiDuplicateInput = z.infer<typeof aiDuplicateSchema>;
export type AiSearchQuery = z.infer<typeof aiSearchQuerySchema>;
export type AiAssigneeInput = z.infer<typeof aiAssigneeSchema>;
export type AiTriageInput = z.infer<typeof aiTriageSchema>;
export type RemoteCategorize = z.infer<typeof remoteCategorizeSchema>;
export type RemotePrioritize = z.infer<typeof remotePrioritizeSchema>;
export type RemoteSummarize = z.infer<typeof remoteSummarizeSchema>;
export type RemoteTriage = z.infer<typeof remoteTriageSchema>;
