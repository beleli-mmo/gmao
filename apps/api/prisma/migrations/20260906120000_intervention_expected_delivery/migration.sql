-- Date de livraison / fin prévue fixée lors du planning
ALTER TABLE "Intervention" ADD COLUMN "expectedDeliveryAt" TIMESTAMP(3);
