import type { RequestHandler } from "express";
import config from "../config";
import { AppError } from "../utils/AppError";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "../utils/cookie";

const unsafeMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const authCookies = [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE];
const expectedOrigin = new URL(config.frontend_url).origin;

export const csrfProtection: RequestHandler = (req, _res, next) => {
	if (!unsafeMethods.has(req.method)) {
		next();
		return;
	}

	const hasAuthCookie = authCookies.some((name) => req.cookies?.[name]);
	if (!hasAuthCookie) {
		next();
		return;
	}

	const rawOrigin = req.get("origin") ?? req.get("referer");
	if (!rawOrigin || rawOrigin === "null") {
		next(AppError.forbidden("The request origin could not be verified."));
		return;
	}

	try {
		if (new URL(rawOrigin).origin !== expectedOrigin) {
			next(AppError.forbidden("The request origin is not allowed."));
			return;
		}
	} catch {
		next(AppError.forbidden("The request origin is not valid."));
		return;
	}

	next();
};
