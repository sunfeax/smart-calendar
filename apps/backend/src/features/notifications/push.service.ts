import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, ECDH } from 'node:crypto';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_PUSH_SUBSCRIPTIONS, PUSH_TIMEOUT_MS } from './notification.constants.js';
import { PushConfigDto, PushSubscriptionDto } from './notification.dto.js';

@Injectable()
export class PushService implements OnModuleInit {
  // DEPENDENCIES
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // COMPUTED
  get enabled(): boolean {
    return this.vapidDetails !== null;
  }

  private get vapidDetails(): NonNullable<webpush.RequestOptions['vapidDetails']> | null {
    const subject = this.config.get<string>('VAPID_SUBJECT');
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
  }

  // LIFECYCLE
  onModuleInit(): void {
    const details = this.vapidDetails;
    if (!details) return;
    try {
      webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);
    } catch {
      throw new Error('Invalid VAPID configuration');
    }
  }

  // ACTIONS
  getConfig(): PushConfigDto {
    return { publicKey: this.vapidDetails?.publicKey ?? null };
  }

  async subscribe(
    userId: string,
    sessionId: string,
    dto: PushSubscriptionDto,
  ): Promise<void> {
    if (!this.enabled) throw new ServiceUnavailableException('Push is not configured');
    this.assertSubscription(dto);
    const endpointHash = this.hashEndpoint(dto.endpoint);
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpointHash },
      select: { id: true },
    });
    if (!existing) {
      const count = await this.prisma.pushSubscription.count({
        where: { session: { userId, expiresAt: { gt: new Date() } } },
      });
      if (count >= MAX_PUSH_SUBSCRIPTIONS) {
        throw new BadRequestException('Too many notification devices');
      }
    }
    const data = {
      sessionId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      language: dto.language,
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpointHash },
      create: { ...data, endpointHash },
      update: data,
    });
  }

  async unsubscribe(sessionId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { sessionId, endpointHash: this.hashEndpoint(endpoint) },
    });
  }

  async send(
    subscription: webpush.PushSubscription,
    payload: unknown,
    ttl: number,
  ): Promise<void> {
    const vapidDetails = this.vapidDetails;
    if (!vapidDetails) throw new ServiceUnavailableException('Push is not configured');
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      vapidDetails,
      TTL: ttl,
      timeout: PUSH_TIMEOUT_MS,
      urgency: 'high',
    });
  }

  // HELPERS
  private assertSubscription(dto: PushSubscriptionDto): void {
    const url = new URL(dto.endpoint);
    const trusted =
      url.hostname === 'fcm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname.endsWith('.push.services.mozilla.com') ||
      url.hostname === 'web.push.apple.com' ||
      url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.notify.windows.com');
    if (
      !trusted ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== '443')
    ) {
      throw new BadRequestException('Unsupported push endpoint');
    }
    try {
      ECDH.convertKey(Buffer.from(dto.keys.p256dh, 'base64url'), 'prime256v1');
    } catch {
      throw new BadRequestException('Invalid push encryption key');
    }
  }

  private hashEndpoint(endpoint: string): string {
    return createHash('sha256').update(endpoint).digest('hex');
  }
}
