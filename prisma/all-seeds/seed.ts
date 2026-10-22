import { prisma } from "../../src/app/lib/prisma";
import { hashPassword } from "../../src/app/utils/password";
import { adminSeed } from "./admin.seed";
import { citizenSeed } from "./citizen.seed";
import { seedIssues } from "./issues.seed";
import { personnelSeed } from "./personnel.seed";
import type { SeedAccount, SeedResult } from "./seed.types";

const seedAccount = async (
	account: SeedAccount,
): Promise<"created" | "existing"> => {
	const email = account.email.trim().toLowerCase();

	const current = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});

	if (current) {
		return "existing";
	}

	const passwordHash = await hashPassword(account.password);

	try {
		await prisma.user.create({
			data: {
				name: account.name,
				email,
				passwordHash,
				role: account.role,
				imageUrl: account.imageUrl,
				emailVerified: true,
				emailVerifiedAt: new Date(),
			},
		});
		return "created";
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error as { code?: string }).code === "P2002"
		) {
			return "existing";
		}
		throw error;
	}
};

export const seedUsers = async (): Promise<SeedResult> => {
	const accounts = [adminSeed(), personnelSeed(), citizenSeed()];
	const created: SeedAccount[] = [];
	const existing: SeedAccount[] = [];

	for (const account of accounts) {
		const result = await seedAccount(account);

		if (result === "created") created.push(account);
		else existing.push(account);
	}

	return { created, existing };
};

if (import.meta.main) {
	const { created, existing } = await seedUsers();
	const issues = await seedIssues();

	console.log(`Seeded ${created.length} account(s).`);
	console.log(`Already present: ${existing.length}.`);
	console.log(`Issues created: ${issues.created}.`);
	console.log(`Issues already present: ${issues.existing}.`);
	console.log(`Issues skipped: ${issues.skipped}.`);

	await prisma.$disconnect();
}
