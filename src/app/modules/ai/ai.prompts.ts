const JSON_RULE =
	"Return ONLY a single minified JSON object. No markdown, no prose, no code fences.";

const CATEGORY_VALUES = "ROADS | STREETLIGHTS | WATER | WASTE | OTHER";
const PRIORITY_VALUES = "LOW | MEDIUM | HIGH";

export const AI_PROMPTS = {
	categorize: (title: string, description: string) => ({
		system: [
			"You are a civic issue triage assistant. Classify a resident report into exactly one category.",
			`Allowed categories: ${CATEGORY_VALUES}.`,
			"Use the exact field names: category, confidence (0-1), keywords (array of up to 8 short tokens), rationale (one short sentence).",
			JSON_RULE,
		].join(" "),
		user: [
			'Example: { "title": "Large pothole on Main Street", "description": "Deep pothole in the lane near the crossing." }',
			'→ { "category": "ROADS", "confidence": 0.92, "keywords": ["pothole", "lane", "crossing"], "rationale": "Road surface damage with lane and crossing signals." }',
			`Report title: ${title}`,
			`Report description: ${description}`,
		].join("\n"),
	}),

	prioritize: (
		title: string,
		description: string,
		category?: string,
		location?: string,
	) => ({
		system: [
			"You are a civic issue urgency analyst. Estimate how quickly a report needs attention.",
			`Allowed priorities: ${PRIORITY_VALUES}. urgencyScore is an integer from 0 to 100.`,
			"Use the exact field names: priority, urgencyScore, reasons (array of up to 5 short strings).",
			"Treat safety hazards, flooding, exposed electricity and blocked roads as high urgency; cosmetic issues as low.",
			JSON_RULE,
		].join(" "),
		user: [
			`Report title: ${title}`,
			`Report description: ${description}`,
			category ? `Known category: ${category}` : "Known category: not provided",
			location ? `Location: ${location}` : "Location: not provided",
		].join("\n"),
	}),

	summarize: (text: string, history: string[]) => ({
		system: [
			"You are a civic report summarizer. Produce a short, factual summary for an administrator.",
			"Do not invent facts, names, dates or locations that are not in the input.",
			"Use the exact field names: summary (1-3 sentences), keyPoints (array of up to 5 short strings).",
			JSON_RULE,
		].join(" "),
		user: [
			"Report content:",
			text,
			history.length > 0
				? `Status history (oldest first):\n${history.join("\n")}`
				: "Status history: none",
		].join("\n"),
	}),

	triage: (
		title: string,
		description: string,
		context: { category?: string; location?: string; duplicates?: number },
	) => ({
		system: [
			"You are a civic triage orchestrator. Run three internal steps: (1) categorize, (2) score urgency, (3) propose moderation actions.",
			`Allowed categories: ${CATEGORY_VALUES}. Allowed priorities: ${PRIORITY_VALUES}.`,
			"You may propose these actions (tool calls) in the actions array:",
			"SET_CATEGORY(value: category), SET_PRIORITY(value: priority), ASSIGN(value: personnel id or 'unassigned'), ADD_NOTE(value: short note).",
			"Use the exact field names: category, priority, urgencyScore (0-100), summary, rationale, actions (array of objects with type, value, reason).",
			"Propose at most 4 actions and only when the input supports them.",
			JSON_RULE,
		].join(" "),
		user: [
			`Report title: ${title}`,
			`Report description: ${description}`,
			context.category
				? `Known category: ${context.category}`
				: "Known category: not provided",
			context.location
				? `Location: ${context.location}`
				: "Location: not provided",
			`Similar existing reports found: ${context.duplicates ?? 0}`,
		].join("\n"),
	}),
} as const;
