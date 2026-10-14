-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "isOpen" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "driverPayout" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "merchantId" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_merchantId_status_idx" ON "Order"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Order_driverId_status_idx" ON "Order"("driverId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The order lifecycle: the merchant owns placed..ready, the driver the rest.
ALTER TABLE "Order" DROP CONSTRAINT "Order_status_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check"
  CHECK ("status" IN ('placed', 'accepted', 'packing', 'ready', 'out_for_delivery', 'delivered', 'rejected'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverPayout_check"
  CHECK ("driverPayout" >= 0);
