-- "Come at my own time": optional scheduled-token target. Null = immediate token.
ALTER TABLE "Appointment" ADD COLUMN "targetTime" TIMESTAMP(3);

-- Activation lookups: scheduled tokens for a doctor/day ordered by target time.
CREATE INDEX "Appointment_doctorId_queueDate_targetTime_idx"
  ON "Appointment" ("doctorId", "queueDate", "targetTime");
