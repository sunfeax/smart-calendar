import { type CalendarRole } from '../../../generated/prisma/enums.js';

export class MemberDto {
  userId!: string;
  name!: string;
  email!: string;
  avatarUrl!: string | null;
  role!: CalendarRole;
  joinedAt!: string;
}
