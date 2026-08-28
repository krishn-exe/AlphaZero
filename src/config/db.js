const { PrismaClient } = require('@prisma/client');

// Reuse a single Prisma instance across the app instead of creating
// a new connection per request.
const prisma = new PrismaClient();

module.exports = prisma;
