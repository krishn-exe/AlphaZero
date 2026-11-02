-- DropTable
DROP TABLE IF EXISTS "incidents";

-- AlterTable
ALTER TABLE "subscribers" DROP COLUMN IF EXISTS "phone",
DROP COLUMN IF EXISTS "subscribed_at",
ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "otp_hash" TEXT,
ADD COLUMN IF NOT EXISTS "otp_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "email_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "push_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "fcm_token" TEXT,
ADD COLUMN IF NOT EXISTS "settings_token" TEXT,
ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "subscribers_email_key" ON "subscribers"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscribers_email_idx" ON "subscribers"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscribers_email_verified_otp_expires_at_idx" ON "subscribers"("email_verified", "otp_expires_at");
