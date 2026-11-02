-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Event_calendarId_archivedAt_idx" ON "Event"("calendarId", "archivedAt");
