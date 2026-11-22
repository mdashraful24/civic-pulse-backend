import { describe, expect, it } from "vitest";
import { sanitizeText } from "./sanitize";

describe("sanitizeText", () => {
	it("removes dangerous markup and event handlers", () => {
		const input =
			'<script>alert(1)</script>Hello <b>world</b> onclick="bad()" javascript:alert(1)';

		expect(sanitizeText(input)).toBe("Hello world alert(1)");
	});

	it("removes control characters and trims whitespace", () => {
		expect(sanitizeText("  A\u0000B  ")).toBe("AB");
	});
});
