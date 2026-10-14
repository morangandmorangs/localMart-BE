-- A merchant can run more than one kind of business.
ALTER TABLE "Merchant" ADD COLUMN     "businessTypes" TEXT[] DEFAULT ARRAY['general-store']::TEXT[];
UPDATE "Merchant" SET "businessTypes" = ARRAY["businessType"];
ALTER TABLE "Merchant" DROP COLUMN "businessType";
