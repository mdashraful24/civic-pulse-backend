import type { Role } from "../../generated/prisma/enums";

export type SeedAccount = {
	label: string;
	name: string;
	email: string;
	password: string;
	role: Role;
};

export type SeedResult = {
	created: SeedAccount[];
	existing: SeedAccount[];
};
