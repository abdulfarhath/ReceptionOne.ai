-- Replace the fixed time-slot model with a live token queue.
-- Slot-era appointments are incompatible with the queue model, so we clear the
-- appointment data (and its dependent rows) before adding the NOT NULL queue
-- columns. Doctors, patients and availability are preserved.
DELETE FROM "Notification";
DELETE FROM "AppointmentEvent";
DELETE FROM "Appointment";

-- Doctor: queue wait estimates use avgConsultMinutes.
ALTER TABLE "Doctor" ADD COLUMN "avgConsultMinutes" INTEGER NOT NULL DEFAULT 15;

-- Appointment becomes a queue entry.
ALTER TABLE "Appointment"
  ADD COLUMN "queueDate" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "token" INTEGER NOT NULL,
  ADD COLUMN "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPriority" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onHold" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "arrivedAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "doneAt" TIMESTAMP(3),
  ALTER COLUMN "start" DROP NOT NULL,
  ALTER COLUMN "end" DROP NOT NULL;

DROP INDEX IF EXISTS "Appointment_doctorId_start_idx";
CREATE INDEX "Appointment_doctorId_queueDate_idx" ON "Appointment"("doctorId", "queueDate");
CREATE UNIQUE INDEX "Appointment_doctorId_queueDate_token_key" ON "Appointment"("doctorId", "queueDate", "token");
