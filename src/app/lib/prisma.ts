import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import config from "../config";

const adapter = new PrismaPg(config.database_url);

export const prisma = new PrismaClient({ adapter });
