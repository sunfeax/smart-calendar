-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrenceRule" TEXT,
ADD COLUMN     "timeZone" TEXT;

-- CreateTable
CREATE TABLE "EventException" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "originalStart" TIMESTAMPTZ(3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "overrides" JSONB,

    CONSTRAINT "EventException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventException_eventId_originalStart_key" ON "EventException"("eventId", "originalStart");

-- AddForeignKey
ALTER TABLE "EventException" ADD CONSTRAINT "EventException_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
