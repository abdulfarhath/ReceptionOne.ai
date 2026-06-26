-- Track the last max-wait (minutes) a patient was told, so the queue can send a
-- one-time "running behind" update when their estimate slips past a threshold.
ALTER TABLE "Appointment" ADD COLUMN "lastNotifiedMaxMinutes" INTEGER;
