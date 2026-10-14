-- CreateTable
CREATE TABLE "Farmer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
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
    "addressLine" TEXT,
    "village" TEXT,
    "district" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "landSize" DOUBLE PRECISION,
    "landUnit" TEXT NOT NULL DEFAULT 'acre',

    CONSTRAINT "Farmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmerCrop" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "variety" TEXT,
    "area" DOUBLE PRECISION,
    "plantedOn" TIMESTAMP(3) NOT NULL,
    "expectedHarvestOn" TIMESTAMP(3) NOT NULL,
    "harvestedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmerCrop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_email_key" ON "Farmer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_phoneNumber_key" ON "Farmer"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Farmer_firebaseUid_key" ON "Farmer"("firebaseUid");

-- CreateIndex
CREATE INDEX "FarmerCrop_farmerId_idx" ON "FarmerCrop"("farmerId");

-- AddForeignKey
ALTER TABLE "FarmerCrop" ADD CONSTRAINT "FarmerCrop_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
