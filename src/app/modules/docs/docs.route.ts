import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import openapiDocument from "../../../docs/openapi.json";

const router = express.Router();

router.use(
	helmet.contentSecurityPolicy({
		useDefaults: false,
		directives: {
			defaultSrc: ["'self'"],
			baseUri: ["'self'"],
			connectSrc: ["'self'"],
			fontSrc: ["'self'", "data:"],
			formAction: ["'none'"],
			frameAncestors: ["'none'"],
			imgSrc: ["'self'", "data:", "https:"],
			objectSrc: ["'none'"],
			scriptSrc: ["'self'", "'unsafe-inline'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
		},
	}),
);

router.get("/openapi.json", (_req, res) => {
	res.status(200).json(openapiDocument);
});

router.use(
	"/",
	swaggerUi.serve,
	swaggerUi.setup(openapiDocument, {
		customSiteTitle: "CivicPulse API",
	}),
);

export const DocsRoutes = router;
