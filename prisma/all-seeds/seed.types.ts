import type { Role } from "../../generated/prisma/enums";

export type SeedAccount = {
	label: string;
	name: string;
	email: string;
	password: string;
	role: Role;
	imageUrl: string | null;
};

export type SeedResult = {
	created: SeedAccount[];
	existing: SeedAccount[];
};

export type SeedIssuesResult = {
	created: number;
	existing: number;
	skipped: number;
};
