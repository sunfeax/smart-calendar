import { ConflictException } from '@nestjs/common';

export function assertCompleteOrder(currentIds: string[], ids: string[]): void {
  const current = new Set(currentIds);
  if (ids.length !== current.size || !ids.every(id => current.has(id))) {
    throw new ConflictException('Order is outdated');
  }
}
