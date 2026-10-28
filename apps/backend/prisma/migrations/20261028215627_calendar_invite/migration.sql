-- CreateTable
CREATE TABLE "CalendarInvite" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "CalendarRole" NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarInvite_tokenHash_key" ON "CalendarInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CalendarInvite_calendarId_idx" ON "CalendarInvite"("calendarId");

-- AddForeignKey
ALTER TABLE "CalendarInvite" ADD CONSTRAINT "CalendarInvite_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarInvite" ADD CONSTRAINT "CalendarInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarInvite" ADD CONSTRAINT "CalendarInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
