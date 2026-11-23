import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../../../app";

describe("API documentation", () => {
	it("serves Swagger UI", async () => {
		const response = await request(app).get("/api-docs").redirects(1);

		expect(response.status).toBe(200);
		expect(response.headers["content-type"]).toContain("text/html");
		expect(response.text).toContain('id="swagger-ui"');
		expect(response.headers["content-security-policy"]).toContain(
			"'unsafe-inline'",
		);
	});

	it("serves the OpenAPI document", async () => {
		const response = await request(app).get("/api-docs/openapi.json");

		expect(response.status).toBe(200);
		expect(response.body.openapi).toBe("3.0.3");
		expect(response.body.info.title).toBe("CivicPulse API");
		expect(Object.keys(response.body.paths).length).toBeGreaterThan(40);
	});
});
