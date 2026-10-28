import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'truncate' })
export class TruncatePipe implements PipeTransform {
  transform(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }
}
