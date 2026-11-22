import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import config from "../config";
import { ACCESS_TOKEN_COOKIE } from "../utils/cookie";
import { csrfProtection } from "./csrf";

const app = express();
app.use(cookieParser());
app.use(csrfProtection);
app.post("/test", (_req, res) => {
	res.json({ ok: true });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
	res.status(error.statusCode ?? 500).json({ message: error.message });
};
app.use(errorHandler);

const origin = new URL(config.frontend_url).origin;

describe("csrfProtection", () => {
	it("allows unsafe requests without an auth cookie", async () => {
		const response = await request(app).post("/test");

		expect(response.status).toBe(200);
	});

	it("allows a credentialed request from the configured origin", async () => {
		const response = await request(app)
			.post("/test")
			.set("Cookie", `${ACCESS_TOKEN_COOKIE}=token`)
			.set("Origin", origin);

		expect(response.status).toBe(200);
	});

	it("rejects a credentialed request from another origin", async () => {
		const response = await request(app)
			.post("/test")
			.set("Cookie", `${ACCESS_TOKEN_COOKIE}=token`)
			.set("Origin", "https://evil.example");

		expect(response.status).toBe(403);
	});

	it("rejects a credentialed request without an origin", async () => {
		const response = await request(app)
			.post("/test")
			.set("Cookie", `${ACCESS_TOKEN_COOKIE}=token`);

		expect(response.status).toBe(403);
	});
});
