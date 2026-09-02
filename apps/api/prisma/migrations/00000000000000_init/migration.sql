-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FIELD_MANAGER', 'PARK_MANAGER', 'MECHANIC', 'ADMIN');

-- CreateEnum
CREATE TYPE "EquipmentKind" AS ENUM ('INSTALLATION', 'EQUIPEMENT', 'ORGANE', 'OUVRAGE');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('EN_SERVICE', 'EN_PANNE', 'EN_MAINTENANCE', 'EN_TRANSIT', 'REFORME');

-- CreateEnum
CREATE TYPE "MeterKind" AS ENUM ('HEURES', 'KM', 'NONE');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('PANNE_CRITIQUE', 'MAINTENANCE_PREVENTIVE', 'DEMANDE_PIECE');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('N1_BLOQUANT', 'N2_MAJEUR', 'N3_MINEUR');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('CREE', 'EN_ATTENTE', 'QUALIFIE', 'PLANIFIE', 'EN_COURS', 'TRAVAUX_TERMINES', 'VALIDE_TERRAIN', 'CLOTURE', 'ANNULE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PHOTO', 'VIDEO', 'VOICE_NOTE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AssigneeKind" AS ENUM ('MECHANIC', 'PROVIDER');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('MAIN_OEUVRE', 'PIECE', 'FACTURE_EXTERNE', 'DEPLACEMENT');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('ENTREE', 'SORTIE', 'AJUSTEMENT', 'RETOUR');

-- CreateEnum
CREATE TYPE "PreventiveTrigger" AS ENUM ('HEURES', 'KM', 'CALENDAIRE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "specialties" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalLot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultFrequency" TEXT,
    "isRegulatory" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TechnicalLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EquipmentKind" NOT NULL,
    "lotId" TEXT,
    "zone" TEXT,
    "criticality" TEXT NOT NULL DEFAULT 'STANDARD',
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "year" INTEGER,
    "meterKind" "MeterKind" NOT NULL DEFAULT 'NONE',
    "currentMeter" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'EN_SERVICE',
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionCost" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toDate" TIMESTAMP(3),

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "kind" "MeterKind" NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'FIELD',
    "recordedById" TEXT,
    "ticketId" TEXT,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreventivePlan" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "trigger" "PreventiveTrigger" NOT NULL,
    "intervalValue" DECIMAL(12,2) NOT NULL,
    "lastDoneMeter" DECIMAL(12,2),
    "lastDoneDate" TIMESTAMP(3),
    "nextDueMeter" DECIMAL(12,2),
    "nextDueDate" TIMESTAMP(3),
    "isRegulatory" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PreventivePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'CREE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "siteId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "lotId" TEXT,
    "preventivePlanId" TEXT,
    "reporterId" TEXT NOT NULL,
    "qualifierId" TEXT,
    "meterAtReport" DECIMAL(12,2),
    "dueDate" TIMESTAMP(3),
    "createdAtField" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qualifiedAt" TIMESTAMP(3),
    "plannedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "workDoneAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL DEFAULT 'API',

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "couchAttId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSignature" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signatureKey" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceInfo" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,

    CONSTRAINT "TicketSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "assigneeKind" "AssigneeKind" NOT NULL,
    "mechanicId" TEXT,
    "providerId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "laborHours" DECIMAL(8,2),
    "laborRate" DECIMAL(10,2),
    "report" TEXT,
    "travelKm" DECIMAL(8,2),

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'U',
    "unitCost" DECIMAL(12,2) NOT NULL,
    "reorderPoint" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reorderQty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'MAGASIN_CENTRAL',
    "onHand" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "ticketId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPart" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "interventionId" TEXT,
    "partId" TEXT NOT NULL,
    "qtyRequested" DECIMAL(12,2) NOT NULL,
    "qtyConsumed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TicketPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalInvoice" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "providerId" TEXT,
    "invoiceRef" TEXT NOT NULL,
    "amountHT" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostLine" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "lotId" TEXT,
    "kind" "CostKind" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "couchId" TEXT NOT NULL,
    "couchRev" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "clientId" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "seq" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Site_code_key" ON "Site"("code");

-- CreateIndex
CREATE INDEX "Site_active_idx" ON "Site"("active");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalLot_code_key" ON "TechnicalLot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_assetTag_key" ON "Equipment"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_qrPayload_key" ON "Equipment"("qrPayload");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_kind_idx" ON "Equipment"("kind");

-- CreateIndex
CREATE INDEX "Equipment_lotId_idx" ON "Equipment"("lotId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_equipmentId_toDate_idx" ON "EquipmentAssignment"("equipmentId", "toDate");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_siteId_idx" ON "EquipmentAssignment"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "MeterReading_ticketId_key" ON "MeterReading"("ticketId");

-- CreateIndex
CREATE INDEX "MeterReading_equipmentId_readAt_idx" ON "MeterReading"("equipmentId", "readAt");

-- CreateIndex
CREATE INDEX "PreventivePlan_equipmentId_active_idx" ON "PreventivePlan"("equipmentId", "active");

-- CreateIndex
CREATE INDEX "PreventivePlan_nextDueDate_idx" ON "PreventivePlan"("nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_reference_key" ON "Ticket"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_clientId_key" ON "Ticket"("clientId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_siteId_status_idx" ON "Ticket"("siteId", "status");

-- CreateIndex
CREATE INDEX "Ticket_equipmentId_idx" ON "Ticket"("equipmentId");

-- CreateIndex
CREATE INDEX "Ticket_lotId_idx" ON "Ticket"("lotId");

-- CreateIndex
CREATE INDEX "Ticket_urgency_status_idx" ON "Ticket"("urgency", "status");

-- CreateIndex
CREATE INDEX "Ticket_type_dueDate_idx" ON "Ticket"("type", "dueDate");

-- CreateIndex
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSignature_ticketId_key" ON "TicketSignature"("ticketId");

-- CreateIndex
CREATE INDEX "Intervention_ticketId_idx" ON "Intervention"("ticketId");

-- CreateIndex
CREATE INDEX "Intervention_mechanicId_scheduledFor_idx" ON "Intervention"("mechanicId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sku_key" ON "Part"("sku");

-- CreateIndex
CREATE INDEX "Part_category_idx" ON "Part"("category");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_partId_key" ON "StockItem"("partId");

-- CreateIndex
CREATE INDEX "StockMovement_partId_createdAt_idx" ON "StockMovement"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketPart_ticketId_idx" ON "TicketPart"("ticketId");

-- CreateIndex
CREATE INDEX "TicketPart_partId_idx" ON "TicketPart"("partId");

-- CreateIndex
CREATE INDEX "ExternalInvoice_ticketId_idx" ON "ExternalInvoice"("ticketId");

-- CreateIndex
CREATE INDEX "CostLine_siteId_incurredAt_idx" ON "CostLine"("siteId", "incurredAt");

-- CreateIndex
CREATE INDEX "CostLine_lotId_incurredAt_idx" ON "CostLine"("lotId", "incurredAt");

-- CreateIndex
CREATE INDEX "CostLine_ticketId_idx" ON "CostLine"("ticketId");

-- CreateIndex
CREATE INDEX "CostLine_equipmentId_kind_idx" ON "CostLine"("equipmentId", "kind");

-- CreateIndex
CREATE INDEX "SyncLog_clientId_idx" ON "SyncLog"("clientId");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SyncLog_couchId_couchRev_key" ON "SyncLog"("couchId", "couchRev");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "TechnicalLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreventivePlan" ADD CONSTRAINT "PreventivePlan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "TechnicalLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_preventivePlanId_fkey" FOREIGN KEY ("preventivePlanId") REFERENCES "PreventivePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_qualifierId_fkey" FOREIGN KEY ("qualifierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSignature" ADD CONSTRAINT "TicketSignature_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSignature" ADD CONSTRAINT "TicketSignature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPart" ADD CONSTRAINT "TicketPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalInvoice" ADD CONSTRAINT "ExternalInvoice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalInvoice" ADD CONSTRAINT "ExternalInvoice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLine" ADD CONSTRAINT "CostLine_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLine" ADD CONSTRAINT "CostLine_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLine" ADD CONSTRAINT "CostLine_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostLine" ADD CONSTRAINT "CostLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "TechnicalLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

