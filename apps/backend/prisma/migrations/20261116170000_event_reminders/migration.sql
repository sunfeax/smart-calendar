CREATE TABLE "EventReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL DEFAULT 15,
    "allDayTime" TEXT NOT NULL DEFAULT '09:00',
    "timeZone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventReminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "endpointHash" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "originalStart" TIMESTAMPTZ(3) NOT NULL,
    "remindAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventReminder_eventId_key" ON "EventReminder"("eventId");

CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription"("endpointHash");

CREATE INDEX "PushSubscription_sessionId_idx" ON "PushSubscription"("sessionId");

CREATE INDEX "ReminderDelivery_createdAt_idx" ON "ReminderDelivery"("createdAt");

CREATE INDEX "ReminderDelivery_subscriptionId_idx" ON "ReminderDelivery"("subscriptionId");

CREATE UNIQUE INDEX "ReminderDelivery_reminderId_subscriptionId_originalStart_key" ON "ReminderDelivery"("reminderId", "subscriptionId", "originalStart");

ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "EventReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_minutesBefore_check" CHECK ("minutesBefore" BETWEEN 0 AND 10080);
ALTER TABLE "EventReminder" ADD CONSTRAINT "EventReminder_allDayTime_check" CHECK ("allDayTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
