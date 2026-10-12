import type { Request } from 'express';
import type { User } from '../generated/prisma/client.js';

export interface AuthReq extends Request {
  user: User;
  sessionId: string;
}
