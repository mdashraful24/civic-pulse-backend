import config from "../../src/app/config";
import type { SeedAccount } from "./seed.types";

export const personnelSeed = (): SeedAccount => ({
	label: "personnel",
	name: config.seed_personnel_name,
	email: config.seed_personnel_email,
	password: config.seed_personnel_password,
	role: "PERSONNEL",
	imageUrl: "https://picsum.photos/seed/civicpulse-personnel/256/256",
});
