import { z } from "zod";
import { sanitizeText } from "./sanitize";

export const sanitizedString = (schema: z.ZodString) =>
	z.string().transform(sanitizeText).pipe(schema);
