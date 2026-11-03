import { PrismaClient } from '@prisma/client';
import { colourFamilyWrite } from '@/utils/colour-family-sync';

// Single shared PrismaClient — one connection pool for the whole app
export const prisma = new PrismaClient();

// Every product and variant write files its colour under a fixed colour
// family, whichever route did the write. Eleven code paths write variants;
// doing this once here means none of them can forget, and the storefront
// filter (which only reads the family) can never miss a colour.
prisma.$use(async (params, next) => {
  colourFamilyWrite(params.model, params.action, params.args);
  return next(params);
});

export default prisma;
