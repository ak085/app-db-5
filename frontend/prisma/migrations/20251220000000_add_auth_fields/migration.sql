-- Add authentication fields to SystemSettings
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "adminUsername" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "adminPasswordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "masterPinHash" TEXT;
