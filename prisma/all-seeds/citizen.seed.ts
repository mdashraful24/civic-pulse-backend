import config from "../../src/app/config";
import type { SeedAccount } from "./seed.types";

export const citizenSeed = (): SeedAccount => ({
	label: "citizen",
	name: config.seed_citizen_name,
	email: config.seed_citizen_email,
	password: config.seed_citizen_password,
	role: "CITIZEN",
});
