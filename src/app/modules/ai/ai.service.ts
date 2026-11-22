import type { Prisma } from "../../../../generated/prisma/client";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import logger from "../../logger";
import { AppError } from "../../utils/AppError";
import type {
	AIAttribution,
	AssigneeRecommendation,
	CategorySuggestion,
	CorpusIssue,
	PrioritySuggestion,
	SimilarIssue,
	SuggestedAction,
	SummarySuggestion,
	TriageSuggestion,
} from "./ai.interface";
import { AI_CAPABILITIES } from "./ai.interface";
import { AI_PROMPTS } from "./ai.prompts";
import {
	type AICompletionRequest,
	type AICompletionResult,
	buildLocalActions,
	getAIProvider,
	localProvider,
} from "./ai.provider";
import {
	buildIdf,
	categorizeHeuristic,
	cosineSimilarity,
	findSimilarIssues,
	rankCategories,
	summarizeHeuristic,
	tokenize,
	urgencyHeuristic,
	vectorize,
} from "./ai.text";
import {
	assertUsageAllowed,
	getCached,
	getUsage,
	makeCacheKey,
	recordUsage,
	setCached,
} from "./ai.usage";
import type {
	AiAssigneeInput,
	AiCategorizeInput,
	AiDuplicateInput,
	AiPrioritizeInput,
	AiSearchQuery,
	AiSummarizeInput,
} from "./ai.validation";
import {
	remoteCategorizeSchema,
	remotePrioritizeSchema,
	remoteSummarizeSchema,
	remoteTriageSchema,
} from "./ai.validation";

const CORPUS_SELECT = {
	id: true,
	title: true,
	description: true,
	category: true,
	location: true,
	status: true,
	createdAt: true,
} as const satisfies Prisma.IssueSelect;

type CorpusRecord = Prisma.IssueGetPayload<{ select: typeof CORPUS_SELECT }>;

type Wrapped<T> = {
	result: AICompletionResult<T>;
	cached: boolean;
};

const loadCorpus = async (excludeId?: string): Promise<CorpusIssue[]> => {
	const records: CorpusRecord[] = await prisma.issue.findMany({
		where: {
			moderationStatus: "VISIBLE",
			...(excludeId ? { id: { not: excludeId } } : {}),
		},
		select: CORPUS_SELECT,
		orderBy: { createdAt: "desc" },
		take: Math.min(config.ai_max_corpus_items, 5000),
	});

	return records;
};

const attributionOf = <T>(
	userId: string,
	wrapped: Wrapped<T>,
): AIAttribution => ({
	provider: wrapped.result.provider,
	degraded: wrapped.result.degraded,
	...(wrapped.result.reason ? { reason: wrapped.result.reason } : {}),
	cached: wrapped.cached,
	usage: getUsage(userId),
});

const localAttribution = (userId: string, cached = false): AIAttribution => ({
	provider: "local",
	degraded: false,
	cached,
	usage: getUsage(userId),
});

const runCompletion = async <T>(
	userId: string,
	task: AICompletionRequest<T>["task"],
	input: unknown,
	buildRequest: () => AICompletionRequest<T>,
): Promise<Wrapped<T>> => {
	const key = makeCacheKey(userId, task, input);
	const cached = getCached<AICompletionResult<T>>(key);
	if (cached) return { result: cached, cached: true };

	assertUsageAllowed(userId);
	recordUsage(userId);

	const provider = getAIProvider();
	let result: AICompletionResult<T>;

	if (provider.name === "local") {
		result = await provider.complete(buildRequest());
	} else {
		try {
			result = await provider.complete(buildRequest());
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown AI provider error.";
			logger.warn(
				`AI provider "${provider.name}" failed for ${task}: ${reason}. Using local fallback.`,
			);
			result = {
				...(await localProvider.complete(buildRequest())),
				provider: "local-fallback",
				degraded: true,
				reason,
			};
		}
	}

	setCached(key, result);
	return { result, cached: false };
};

const vectorSearch = async (
	userId: string,
	query: string,
	limit: number,
	excludeId?: string,
	minimumScore = 0.08,
): Promise<{ matches: SimilarIssue[]; attribution: AIAttribution }> => {
	const input = { query, limit, excludeId };
	const key = makeCacheKey(userId, "search", input);
	const cached = getCached<SimilarIssue[]>(key);
	if (cached) {
		return { matches: cached, attribution: localAttribution(userId, true) };
	}

	assertUsageAllowed(userId);
	recordUsage(userId);

	const corpus = await loadCorpus(excludeId);
	const matches = findSimilarIssues(query, corpus, limit, minimumScore);
	setCached(key, matches);

	return { matches, attribution: localAttribution(userId) };
};

const rankPersonnel = async (issue: {
	id: string;
	title: string;
	description: string;
	category: CorpusIssue["category"];
}): Promise<AssigneeRecommendation[]> => {
	const personnel = await prisma.user.findMany({
		where: { role: "PERSONNEL", status: "ACTIVE", isDeleted: false },
		select: { id: true, name: true },
		take: 50,
	});

	if (personnel.length === 0) return [];

	const assigned = await prisma.issue.findMany({
		where: { assigneeId: { in: personnel.map((person) => person.id) } },
		select: {
			assigneeId: true,
			title: true,
			description: true,
			category: true,
			status: true,
		},
		take: Math.min(config.ai_max_corpus_items, 1000),
	});

	const issueText = `${issue.title} ${issue.description}`;
	const idf = buildIdf([
		tokenize(issueText),
		...assigned.map((item) => tokenize(`${item.title} ${item.description}`)),
	]);
	const issueVector = vectorize(tokenize(issueText), idf);

	return personnel
		.map((person) => {
			const own = assigned.filter((item) => item.assigneeId === person.id);
			const activeCount = own.filter(
				(item) => item.status !== "RESOLVED",
			).length;
			const resolvedCount = own.filter(
				(item) => item.status === "RESOLVED",
			).length;
			const categoryMatches = own.filter(
				(item) => item.category === issue.category,
			).length;
			const similarity = own.reduce(
				(sum, item) =>
					sum +
					cosineSimilarity(
						issueVector,
						vectorize(tokenize(`${item.title} ${item.description}`), idf),
					),
				0,
			);
			const score = Math.max(
				0,
				Math.min(
					100,
					Math.round(
						30 +
							categoryMatches * 8 +
							resolvedCount * 2 +
							similarity * 25 -
							activeCount * 4,
					),
				),
			);
			const reasons = [
				categoryMatches > 0
					? `${categoryMatches} past ${issue.category} report(s)`
					: "No direct category history",
				`${activeCount} active assignment(s)`,
			];

			return {
				id: person.id,
				name: person.name,
				score,
				reason: `${reasons.join("; ")}; similarity ${similarity.toFixed(2)}.`,
				activeCount,
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 5);
};

const categorize = async (
	userId: string,
	input: AiCategorizeInput,
): Promise<CategorySuggestion & { attribution: AIAttribution }> => {
	const text = `${input.title}. ${input.description}`;
	const prompt = AI_PROMPTS.categorize(input.title, input.description);
	const wrapped = await runCompletion(userId, "categorize", input, () => ({
		task: "categorize",
		system: prompt.system,
		user: prompt.user,
		text,
		schema: remoteCategorizeSchema,
	}));
	const data = wrapped.result.data;
	const heuristic = categorizeHeuristic(text);
	const alternatives = rankCategories(text)
		.filter((item) => item.category !== data.category && item.score > 0)
		.slice(0, 2);

	return {
		category: data.category,
		confidence: data.confidence,
		alternatives,
		keywords: data.keywords.length > 0 ? data.keywords : heuristic.keywords,
		rationale: data.rationale,
		attribution: attributionOf(userId, wrapped),
	};
};

const prioritize = async (
	userId: string,
	input: AiPrioritizeInput,
): Promise<PrioritySuggestion & { attribution: AIAttribution }> => {
	const text = [
		input.title,
		input.description,
		input.category ? `Category: ${input.category}` : "",
		input.location ? `Location: ${input.location}` : "",
	]
		.filter(Boolean)
		.join(". ");
	const prompt = AI_PROMPTS.prioritize(
		input.title,
		input.description,
		input.category,
		input.location,
	);
	const wrapped = await runCompletion(userId, "prioritize", input, () => ({
		task: "prioritize",
		system: prompt.system,
		user: prompt.user,
		text,
		schema: remotePrioritizeSchema,
	}));
	const data = wrapped.result.data;

	return {
		priority: data.priority,
		urgencyScore: data.urgencyScore,
		confidence: urgencyHeuristic(text).confidence,
		reasons: data.reasons,
		attribution: attributionOf(userId, wrapped),
	};
};

const summarize = async (
	userId: string,
	input: AiSummarizeInput,
): Promise<SummarySuggestion & { attribution: AIAttribution }> => {
	let text = input.text ?? "";
	let history: string[] = [];

	if (input.issueId) {
		const issue = await prisma.issue.findUnique({
			where: { id: input.issueId },
			select: { title: true, description: true, resolutionNote: true },
		});
		if (!issue) throw AppError.notFound("Issue not found.");

		text = [issue.title, issue.description, issue.resolutionNote ?? ""]
			.filter(Boolean)
			.join("\n");

		const events = await prisma.issueHistory.findMany({
			where: { issueId: input.issueId },
			select: {
				oldStatus: true,
				newStatus: true,
				note: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});
		history = events.map(
			(event) =>
				`${event.createdAt.toISOString()}: ${event.oldStatus ?? "none"} -> ${event.newStatus}${event.note ? ` (${event.note})` : ""}`,
		);
	}

	const prompt = AI_PROMPTS.summarize(text, history);
	const wrapped = await runCompletion(userId, "summarize", input, () => ({
		task: "summarize",
		system: prompt.system,
		user: prompt.user,
		text,
		schema: remoteSummarizeSchema,
	}));
	const data = wrapped.result.data;

	return {
		summary: data.summary,
		keyPoints: data.keyPoints,
		attribution: attributionOf(userId, wrapped),
	};
};

const duplicates = async (
	userId: string,
	input: AiDuplicateInput,
): Promise<{ matches: SimilarIssue[]; attribution: AIAttribution }> =>
	vectorSearch(
		userId,
		`${input.title}. ${input.description}`,
		input.limit,
		input.excludeId,
	);

const search = async (
	userId: string,
	query: AiSearchQuery,
): Promise<{
	query: string;
	results: SimilarIssue[];
	attribution: AIAttribution;
}> => {
	const { matches, attribution } = await vectorSearch(
		userId,
		query.q,
		query.limit,
		undefined,
		0.05,
	);
	return { query: query.q, results: matches, attribution };
};

const recommendAssignee = async (
	userId: string,
	input: AiAssigneeInput,
): Promise<{
	issueId: string;
	recommendations: AssigneeRecommendation[];
	attribution: AIAttribution;
}> => {
	const key = makeCacheKey(userId, "recommend-assignee", input);
	const cached = getCached<AssigneeRecommendation[]>(key);
	if (cached) {
		return {
			issueId: input.issueId,
			recommendations: cached,
			attribution: localAttribution(userId, true),
		};
	}

	assertUsageAllowed(userId);
	recordUsage(userId);

	const issue = await prisma.issue.findUnique({
		where: { id: input.issueId },
		select: { id: true, title: true, description: true, category: true },
	});
	if (!issue) throw AppError.notFound("Issue not found.");

	const recommendations = await rankPersonnel(issue);
	setCached(key, recommendations);

	return {
		issueId: input.issueId,
		recommendations,
		attribution: localAttribution(userId),
	};
};

const triage = async (
	userId: string,
	input: AiCategorizeInput & {
		location?: string;
		category?: CorpusIssue["category"];
		issueId?: string;
	},
): Promise<TriageSuggestion & { attribution: AIAttribution }> => {
	const text = [
		input.title,
		input.description,
		input.category ? `Category: ${input.category}` : "",
		input.location ? `Location: ${input.location}` : "",
	]
		.filter(Boolean)
		.join(". ");
	const prompt = AI_PROMPTS.triage(input.title, input.description, {
		category: input.category,
		location: input.location,
	});
	const wrapped = await runCompletion(userId, "triage", input, () => ({
		task: "triage",
		system: prompt.system,
		user: prompt.user,
		text,
		schema: remoteTriageSchema,
	}));
	const data = wrapped.result.data;

	const [corpus, heuristicCategory, heuristicPriority, heuristicSummary] =
		await Promise.all([
			loadCorpus(input.issueId),
			Promise.resolve(categorizeHeuristic(text)),
			Promise.resolve(urgencyHeuristic(text)),
			Promise.resolve(summarizeHeuristic(text)),
		]);
	const duplicates = findSimilarIssues(text, corpus, 3);

	const actions: SuggestedAction[] =
		data.actions.length > 0
			? data.actions.map((action) => ({ ...action }))
			: buildLocalActions(heuristicCategory, heuristicPriority);

	if (
		duplicates.length > 0 &&
		!actions.some((action) => action.type === "ADD_NOTE")
	) {
		actions.push({
			type: "ADD_NOTE",
			value: `Possible duplicate: ${duplicates[0]?.title ?? ""}`.slice(0, 200),
			reason: `${Math.round((duplicates[0]?.similarity ?? 0) * 100)}% text similarity with an existing report.`,
		});
	}

	if (input.issueId) {
		const issue = await prisma.issue.findUnique({
			where: { id: input.issueId },
			select: { id: true, title: true, description: true, category: true },
		});
		if (issue) {
			const [recommendation] = await rankPersonnel(issue);
			if (recommendation && recommendation.score >= 60) {
				actions.push({
					type: "ASSIGN",
					value: recommendation.id,
					reason: `Top-ranked personnel (score ${recommendation.score}).`,
				});
			}
		}
	}

	return {
		category: {
			category: data.category,
			confidence: heuristicCategory.confidence,
			alternatives: rankCategories(text)
				.filter((item) => item.category !== data.category && item.score > 0)
				.slice(0, 2),
			keywords: heuristicCategory.keywords,
			rationale: heuristicCategory.rationale,
		},
		priority: {
			priority: data.priority,
			urgencyScore: data.urgencyScore,
			confidence: heuristicPriority.confidence,
			reasons: heuristicPriority.reasons,
		},
		summary: {
			summary: data.summary,
			keyPoints: heuristicSummary.keyPoints,
		},
		duplicates,
		actions: actions.slice(0, 6),
		confidence: Number(
			(
				(heuristicCategory.confidence + heuristicPriority.confidence) /
				2
			).toFixed(2),
		),
		rationale: data.rationale,
		attribution: attributionOf(userId, wrapped),
	};
};

const capabilities = (userId: string) => ({
	provider: getAIProvider().name,
	capabilities: AI_CAPABILITIES,
	usage: getUsage(userId),
	cachingEnabled: config.ai_cache_ttl_seconds > 0,
});

export const AIService = {
	categorize,
	prioritize,
	summarize,
	duplicates,
	search,
	recommendAssignee,
	triage,
	capabilities,
};
