import { Session, User } from '../generated/prisma/client.js';

export interface SessionWithUser extends Session {
  user: User;
}
