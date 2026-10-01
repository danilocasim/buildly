-- Reverts 0003_generation_screens.sql.
ALTER TABLE "generations" DROP COLUMN IF EXISTS "screens";
