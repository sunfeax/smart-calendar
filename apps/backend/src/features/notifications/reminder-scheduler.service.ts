import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { EventReminder, PushSubscription } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DELIVERY_RETENTION_MS,
  REMINDER_BATCH_SIZE,
  REMINDER_CONCURRENCY,
  REMINDER_GRACE_MS,
  REMINDER_INTERVAL_MS,
  REMINDER_LEASE_MS,
  REMINDER_MAX_ATTEMPTS,
} from './notification.constants.js';
import { PushService } from './push.service.js';
import { reminderPayload } from './reminder-payload.js';
import {
  dueReminderOccurrences,
  reminderWindow,
  ReminderOccurrence,
} from './reminder-time.js';

@Injectable()
export class ReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // STATE
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  private lastCleanup = 0;

  // LIFECYCLE
  onModuleInit(): void {
    if (!this.push.enabled) {
      this.logger.warn('Push reminders are disabled until VAPID is configured');
      return;
    }
    this.timer = setInterval(() => this.startCycle(), REMINDER_INTERVAL_MS);
    this.timer.unref();
    this.startCycle();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.running;
  }

  // ACTIONS
  private startCycle(): void {
    if (this.running || this.stopped) return;
    this.running = this.runCycle()
      .catch(() => this.logger.error('Reminder delivery cycle failed'))
      .finally(() => {
        this.running = undefined;
      });
  }

  async runCycle(now = new Date()): Promise<void> {
    if (!this.push.enabled) return;
    if (+now - this.lastCleanup >= 3600000) {
      await this.prisma.reminderDelivery.deleteMany({
        where: { createdAt: { lt: new Date(+now - DELIVERY_RETENTION_MS) } },
      });
      await this.prisma.pushSubscription.deleteMany({
        where: { session: { expiresAt: { lte: now } } },
      });
      this.lastCleanup = +now;
    }
    let cursor: string | undefined;
    while (!this.stopped) {
      const reminders = await this.prisma.eventReminder.findMany({
        where: { event: { archivedAt: null } },
        orderBy: { id: 'asc' },
        take: REMINDER_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (let index = 0; index < reminders.length; index += REMINDER_CONCURRENCY) {
        if (this.stopped) return;
        await Promise.all(
          reminders
            .slice(index, index + REMINDER_CONCURRENCY)
            .map(reminder =>
              this.processReminder(reminder, now).catch(() =>
                this.logger.error('An event reminder could not be processed'),
              ),
            ),
        );
      }
      if (reminders.length < REMINDER_BATCH_SIZE) break;
      cursor = reminders.at(-1)!.id;
    }
  }

  private async processReminder(reminder: EventReminder, now: Date): Promise<void> {
    const { from, to } = reminderWindow(reminder, now);
    const event = await this.prisma.event.findUnique({
      where: { id: reminder.eventId, archivedAt: null },
      include: {
        exceptions: {
          where: {
            OR: [
              { originalStart: { gte: from, lte: to } },
              {
                overrides: {
                  path: ['startAt'],
                  gte: from.toISOString(),
                  lte: to.toISOString(),
                },
              },
            ],
          },
        },
      },
    });
    if (!event) return;
    const occurrences = dueReminderOccurrences(event, reminder, now);
    if (!occurrences.length) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        session: {
          expiresAt: { gt: now },
          user: { memberships: { some: { calendarId: event.calendarId } } },
        },
      },
      orderBy: { id: 'asc' },
      take: 1000,
    });
    for (const occurrence of occurrences) {
      for (const subscription of subscriptions) {
        if (this.stopped) return;
        await this.deliver(reminder, occurrence, subscription, event.calendarId, now);
      }
    }
  }

  private async deliver(
    reminder: EventReminder,
    occurrence: ReminderOccurrence,
    subscription: PushSubscription,
    calendarId: string,
    now: Date,
  ): Promise<void> {
    const delivery = await this.prisma.reminderDelivery.upsert({
      where: {
        reminderId_subscriptionId_originalStart: {
          reminderId: reminder.id,
          subscriptionId: subscription.id,
          originalStart: occurrence.originalStart,
        },
      },
      create: {
        reminderId: reminder.id,
        subscriptionId: subscription.id,
        originalStart: occurrence.originalStart,
        remindAt: occurrence.remindAt,
        nextAttemptAt: now,
      },
      update: {},
    });
    const lockedUntil = new Date(Date.now() + REMINDER_LEASE_MS);
    const claim = await this.prisma.reminderDelivery.updateMany({
      where: {
        id: delivery.id,
        sentAt: null,
        attempts: { lt: REMINDER_MAX_ATTEMPTS },
        nextAttemptAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
      },
      data: { lockedUntil, attempts: { increment: 1 } },
    });
    if (!claim.count) return;
    try {
      const current = await this.prisma.eventReminder.findUnique({
        where: { id: reminder.id },
      });
      const currentEvent = await this.prisma.event.findUnique({
        where: { id: reminder.eventId, archivedAt: null },
        include: { exceptions: { where: { originalStart: occurrence.originalStart } } },
      });
      const eligible = await this.prisma.pushSubscription.findFirst({
        where: {
          id: subscription.id,
          session: {
            expiresAt: { gt: new Date() },
            user: { memberships: { some: { calendarId } } },
          },
        },
        select: { id: true },
      });
      const due =
        current && currentEvent
          ? dueReminderOccurrences(currentEvent, current, new Date()).find(
              item => +item.originalStart === +occurrence.originalStart,
            )
          : undefined;
      if (!current || +current.updatedAt !== +reminder.updatedAt || !eligible || !due) {
        await this.prisma.reminderDelivery.deleteMany({
          where: { id: delivery.id, sentAt: null, lockedUntil },
        });
        return;
      }
      const ttl = Math.max(
        1,
        Math.ceil((+due.remindAt + REMINDER_GRACE_MS - Date.now()) / 1000),
      );
      await this.push.send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        reminderPayload(current, due, calendarId, subscription.language),
        ttl,
      );
      await this.prisma.reminderDelivery.updateMany({
        where: { id: delivery.id, lockedUntil },
        data: { sentAt: new Date(), lockedUntil: null },
      });
    } catch (error: unknown) {
      const status =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 0;
      if (status === 404 || status === 410) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }
      const retryable = status === 0 || status === 429 || status >= 500;
      await this.prisma.reminderDelivery.updateMany({
        where: { id: delivery.id, lockedUntil },
        data: {
          lockedUntil: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(300000, 30000 * 2 ** delivery.attempts),
          ),
          ...(!retryable ? { attempts: REMINDER_MAX_ATTEMPTS } : {}),
        },
      });
      this.logger.warn(`Push delivery failed with status ${status || 'network error'}`);
    }
  }
}
