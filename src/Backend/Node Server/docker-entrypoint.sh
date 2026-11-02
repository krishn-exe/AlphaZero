#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Seeding database (if not already seeded)..."
node prisma/seed.js || true

echo "Starting Landslide Node backend..."
exec node src/server.js
