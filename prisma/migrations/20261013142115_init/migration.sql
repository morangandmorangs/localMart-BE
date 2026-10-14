-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "password" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT 'Manager',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "area" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "password" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'password',
    "firebaseUid" TEXT,
    "profileStatus" TEXT NOT NULL DEFAULT 'pending-documents',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopName" TEXT,
    "area" TEXT,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "password" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'password',
    "firebaseUid" TEXT,
    "profileStatus" TEXT NOT NULL DEFAULT 'pending-documents',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminId" TEXT,
    "merchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "stockCount" INTEGER,
    "pack" TEXT,
    "origin" TEXT,
    "useFor" TEXT,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "merchantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productRef" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "prepMinutes" INTEGER NOT NULL,
    "priceForTwo" DECIMAL(10,2) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "signatureDishes" TEXT[],
    "merchantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressLabel" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressCity" TEXT NOT NULL,
    "addressState" TEXT NOT NULL,
    "addressPincode" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'placed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "merchantId" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_phoneNumber_key" ON "Admin"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_firebaseUid_key" ON "Customer"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phoneNumber_key" ON "Customer"("phoneNumber");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_firebaseUid_key" ON "Merchant"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_firebaseUid_key" ON "Driver"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_adminId_createdAt_idx" ON "DeviceToken"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceToken_merchantId_createdAt_idx" ON "DeviceToken"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productId_key" ON "Product"("productId");

-- CreateIndex
CREATE INDEX "Product_category_subCategory_isActive_idx" ON "Product"("category", "subCategory", "isActive");

-- CreateIndex
CREATE INDEX "Product_merchantId_idx" ON "Product"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productRef_variantId_key" ON "ProductVariant"("productRef", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_restaurantId_key" ON "Restaurant"("restaurantId");

-- CreateIndex
CREATE INDEX "Restaurant_merchantId_idx" ON "Restaurant"("merchantId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_merchantId_idx" ON "OrderItem"("merchantId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productRef_fkey" FOREIGN KEY ("productRef") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the Mongoose schema used to enforce. They live in the database so a
-- write that skips the controllers (a seeder, a psql session) cannot break them.

ALTER TABLE "Admin" ADD CONSTRAINT "Admin_designation_check"
  CHECK ("designation" IN ('Super-Admin', 'Manager', 'Developer'));

ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_provider_check"
  CHECK ("provider" IN ('password', 'google', 'phone'));
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_profileStatus_check"
  CHECK ("profileStatus" IN ('pending-documents', 'under-review', 'approved', 'rejected', 'suspended'));

ALTER TABLE "Driver" ADD CONSTRAINT "Driver_provider_check"
  CHECK ("provider" IN ('password', 'google', 'phone'));
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_profileStatus_check"
  CHECK ("profileStatus" IN ('pending-documents', 'under-review', 'approved', 'rejected', 'suspended'));

-- A device token belongs to exactly one admin or merchant.
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_one_owner_check"
  CHECK (("adminId" IS NULL) <> ("merchantId" IS NULL));

ALTER TABLE "Product" ADD CONSTRAINT "Product_category_check"
  CHECK ("category" IN ('livestock-vegetables', 'grocery', 'food', 'medicine'));
-- An Rx flag is only meaningful in the pharmacy aisle.
ALTER TABLE "Product" ADD CONSTRAINT "Product_rx_only_medicine_check"
  CHECK (NOT "requiresPrescription" OR "category" = 'medicine');
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_check"
  CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockCount_check"
  CHECK ("stockCount" IS NULL OR "stockCount" >= 0);

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_price_check"
  CHECK ("price" >= 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_stockCount_check"
  CHECK ("stockCount" >= 0);

-- Bounded so a bad write cannot render five-and-a-half stars.
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_rating_check"
  CHECK ("rating" >= 0 AND "rating" <= 5);
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_nonnegative_check"
  CHECK ("ratingCount" >= 0 AND "prepMinutes" >= 0 AND "priceForTwo" >= 0);

ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethod_check"
  CHECK ("paymentMethod" IN ('gpay', 'phonepe'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check"
  CHECK ("status" IN ('placed'));
ALTER TABLE "Order" ADD CONSTRAINT "Order_total_check"
  CHECK ("total" >= 0);

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_price_check"
  CHECK ("price" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check"
  CHECK ("quantity" >= 1);
