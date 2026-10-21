import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError";

declare global {
	namespace Express {
		interface Request {
			validatedQuery?: Record<string, unknown>;
		}
	}
}

const toAppError = (error: {
	issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) => {
	const details = error.issues.map((issue) => ({
		field: issue.path.join(".") || "(root)",
		message: issue.message,
	}));

	return new AppError(400, details[0]?.message ?? "Validation failed.", {
		details,
	});
};

export const validateBody =
	<T>(schema: ZodType<T>) =>
	(req: Request, _res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.body ?? {});

		if (!result.success) {
			next(toAppError(result.error));
			return;
		}

		req.body = result.data;
		next();
	};

export const validateQuery =
	<T>(schema: ZodType<T>) =>
	(req: Request, _res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.query ?? {});

		if (!result.success) {
			next(toAppError(result.error));
			return;
		}

		req.validatedQuery = result.data as Record<string, unknown>;
		next();
	};

export const validateParams =
	<T>(schema: ZodType<T>) =>
	(req: Request, _res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.params ?? {});

		if (!result.success) {
			next(toAppError(result.error));
			return;
		}

		req.params = result.data as Request["params"];
		next();
	};
