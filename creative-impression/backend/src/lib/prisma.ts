import { PrismaClient } from '@prisma/client';

// Single shared PrismaClient — one connection pool for the whole app
export const prisma = new PrismaClient();

export default prisma;
