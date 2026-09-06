-- CreateEnum
CREATE TYPE "SupplyStatus" AS ENUM ('DEMANDEE', 'A_MODIFIER', 'VALIDEE', 'RECUE', 'CLOTUREE', 'ANNULEE');

-- CreateTable
CREATE TABLE "SupplyRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "SupplyStatus" NOT NULL DEFAULT 'DEMANDEE',
    "siteId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "needBy" TIMESTAMP(3),
    "reviewNote" TEXT,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "purchaseOrderRef" TEXT,
    "purchaseOrderAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "controlledById" TEXT,
    "controlledAt" TIMESTAMP(3),
    "controlNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'U',
    "note" TEXT,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "SupplyStatus",
    "toStatus" "SupplyStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplyRequest_reference_key" ON "SupplyRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyRequest_purchaseOrderRef_key" ON "SupplyRequest"("purchaseOrderRef");

-- CreateIndex
CREATE INDEX "SupplyRequest_status_idx" ON "SupplyRequest"("status");

-- CreateIndex
CREATE INDEX "SupplyRequest_siteId_idx" ON "SupplyRequest"("siteId");

-- CreateIndex
CREATE INDEX "SupplyRequest_requesterId_idx" ON "SupplyRequest"("requesterId");

-- CreateIndex
CREATE INDEX "SupplyItem_requestId_idx" ON "SupplyItem"("requestId");

-- CreateIndex
CREATE INDEX "SupplyAttachment_requestId_idx" ON "SupplyAttachment"("requestId");

-- CreateIndex
CREATE INDEX "SupplyEvent_requestId_idx" ON "SupplyEvent"("requestId");

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRequest" ADD CONSTRAINT "SupplyRequest_controlledById_fkey" FOREIGN KEY ("controlledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyAttachment" ADD CONSTRAINT "SupplyAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyEvent" ADD CONSTRAINT "SupplyEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyEvent" ADD CONSTRAINT "SupplyEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

