-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- Start at 1001 so order numbers read like "#1001", not "#1".
ALTER SEQUENCE "Order_number_seq" RESTART WITH 1001;
