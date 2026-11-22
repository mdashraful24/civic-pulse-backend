const dangerousBlocks =
	/<\s*(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const tags = /<\s*\/?\s*[a-z][^>]*>/gi;
const eventHandlers = /\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const dangerousSchemes = /\b(?:javascript|data|vbscript)\s*:/gi;

const stripControlCharacters = (value: string): string =>
	Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return (
				code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)
			);
		})
		.join("");

export const sanitizeText = (value: string): string =>
	stripControlCharacters(
		value
			.replace(dangerousBlocks, "")
			.replace(tags, "")
			.replace(eventHandlers, "")
			.replace(dangerousSchemes, ""),
	).trim();
