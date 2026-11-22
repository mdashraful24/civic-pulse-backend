import type { z } from "zod";
import config from "../../config";
import type { AITask, AIProviderName } from "./ai.interface";
import {
	categorizeHeuristic,
	summarizeHeuristic,
	urgencyHeuristic,
} from "./ai.text";

export class AIProviderError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "AIProviderError";
	}
}

export type AICompletionRequest<T> = {
	task: AITask;
	system: string;
	user: string;
	text: string;
	schema: z.ZodType<T>;
};

export type AICompletionResult<T> = {
	data: T;
	provider: AIProviderName | "local-fallback";
	degraded: boolean;
	reason?: string;
};

export type AIProvider = {
	readonly name: AIProviderName;
	complete<T>(request: AICompletionRequest<T>): Promise<AICompletionResult<T>>;
};

export const buildLocalActions = (
	category: ReturnType<typeof categorizeHeuristic>,
	urgency: ReturnType<typeof urgencyHeuristic>,
): Array<{
	type: "SET_CATEGORY" | "SET_PRIORITY" | "ADD_NOTE";
	value: string;
	reason: string;
}> => {
	const actions: Array<{
		type: "SET_CATEGORY" | "SET_PRIORITY" | "ADD_NOTE";
		value: string;
		reason: string;
	}> = [];

	if (category.category !== "OTHER" && category.confidence >= 0.6) {
		actions.push({
			type: "SET_CATEGORY",
			value: category.category,
			reason: category.rationale,
		});
	}

	if (urgency.priority !== "MEDIUM" && urgency.confidence >= 0.6) {
		actions.push({
			type: "SET_PRIORITY",
			value: urgency.priority,
			reason: urgency.reasons[0] ?? "Urgency signals support this priority.",
		});
	}

	return actions;
};

const localInfer = <T>(request: AICompletionRequest<T>): T => {
	switch (request.task) {
		case "categorize":
			return categorizeHeuristic(request.text) as T;
		case "prioritize": {
			const urgency = urgencyHeuristic(request.text);
			return {
				priority: urgency.priority,
				urgencyScore: urgency.urgencyScore,
				reasons: urgency.reasons,
			} as T;
		}
		case "summarize":
			return summarizeHeuristic(request.text) as T;
		case "triage": {
			const category = categorizeHeuristic(request.text);
			const urgency = urgencyHeuristic(request.text);
			const summary = summarizeHeuristic(request.text);
			return {
				category: category.category,
				priority: urgency.priority,
				urgencyScore: urgency.urgencyScore,
				summary: summary.summary,
				rationale: category.rationale,
				actions: buildLocalActions(category, urgency),
			} as T;
		}
		default:
			throw new AIProviderError(
				`The local provider does not support task: ${request.task}`,
			);
	}
};

export const localProvider: AIProvider = {
	name: "local",
	complete: async <T>(request: AICompletionRequest<T>) => ({
		data: request.schema.parse(localInfer(request)),
		provider: "local" as const,
		degraded: false,
	}),
};

const extractJson = (raw: string): unknown => {
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start === -1 || end <= start) {
		throw new AIProviderError("The AI provider did not return a JSON object.");
	}
	return JSON.parse(raw.slice(start, end + 1)) as unknown;
};

const openAiProvider: AIProvider = {
	name: "openai",
	complete: async <T>(request: AICompletionRequest<T>) => {
		const response = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${config.ai_api_key}`,
			},
			body: JSON.stringify({
				model: config.ai_model,
				messages: [
					{ role: "system", content: request.system },
					{ role: "user", content: request.user },
				],
				response_format: { type: "json_object" },
				max_tokens: config.ai_max_tokens,
				temperature: config.ai_temperature,
			}),
			signal: AbortSignal.timeout(config.ai_timeout_ms),
		});

		if (!response.ok) {
			throw new AIProviderError(
				`OpenAI request failed with status ${response.status}.`,
			);
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = payload.choices?.[0]?.message?.content;
		if (!content) {
			throw new AIProviderError("OpenAI returned an empty completion.");
		}

		return {
			data: request.schema.parse(extractJson(content)),
			provider: "openai",
			degraded: false,
		};
	},
};

const geminiProvider: AIProvider = {
	name: "gemini",
	complete: async <T>(request: AICompletionRequest<T>) => {
		const model = config.ai_model.startsWith("models/")
			? config.ai_model
			: `models/${config.ai_model}`;
		const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(config.ai_api_key)}`;

		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				contents: [
					{
						role: "user",
						parts: [{ text: `${request.system}\n\n${request.user}` }],
					},
				],
				generationConfig: {
					responseMimeType: "application/json",
					maxOutputTokens: config.ai_max_tokens,
					temperature: config.ai_temperature,
				},
			}),
			signal: AbortSignal.timeout(config.ai_timeout_ms),
		});

		if (!response.ok) {
			throw new AIProviderError(
				`Gemini request failed with status ${response.status}.`,
			);
		}

		const payload = (await response.json()) as {
			candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
		};
		const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!content) {
			throw new AIProviderError("Gemini returned an empty completion.");
		}

		return {
			data: request.schema.parse(extractJson(content)),
			provider: "gemini",
			degraded: false,
		};
	},
};

export const getAIProvider = (): AIProvider => {
	switch (config.ai_provider) {
		case "openai":
			return openAiProvider;
		case "gemini":
			return geminiProvider;
		default:
			return localProvider;
	}
};
