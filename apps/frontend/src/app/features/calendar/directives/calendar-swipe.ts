import { Directive, input, output } from '@angular/core';

const DIRECTION_THRESHOLD = 12;
const MIN_DISTANCE = 48;
const MAX_DURATION = 750;
const HORIZONTAL_RATIO = 1.5;
const TAP_SUPPRESSION_DURATION = 500;

interface SwipeGesture {
  identifier: number;
  x: number;
  y: number;
  startedAt: number;
  horizontal: boolean;
}

@Directive({
  selector: '[appCalendarSwipe]',
  host: {
    '[style.touch-action]': 'appCalendarSwipe() ? "pan-y pinch-zoom" : null',
    '(touchstart)': 'startSwipe($event)',
    '(touchmove)': 'moveSwipe($event)',
    '(touchend)': 'endSwipe($event)',
    '(touchcancel)': 'cancelSwipe()',
  },
})
export class CalendarSwipe {
  readonly appCalendarSwipe = input(false);
  readonly swipe = output<'prev' | 'next'>();
  private gesture: SwipeGesture | null = null;
  private ignoreTapUntil = 0;

  ignoreTap(): boolean {
    return this.appCalendarSwipe() && performance.now() < this.ignoreTapUntil;
  }

  protected startSwipe(event: TouchEvent): void {
    this.ignoreTapUntil =
      event.touches.length > 1 ? performance.now() + TAP_SUPPRESSION_DURATION : 0;
    const touch = event.touches.item(0);
    this.gesture =
      this.appCalendarSwipe() && event.touches.length === 1 && touch
        ? {
            identifier: touch.identifier,
            x: touch.clientX,
            y: touch.clientY,
            startedAt: event.timeStamp,
            horizontal: false,
          }
        : null;
  }

  protected moveSwipe(event: TouchEvent): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const touch = event.touches.item(0);
    if (
      !this.appCalendarSwipe() ||
      event.touches.length !== 1 ||
      touch?.identifier !== gesture.identifier
    ) {
      this.cancelSwipe();
      return;
    }

    const dx = Math.abs(touch.clientX - gesture.x);
    const dy = Math.abs(touch.clientY - gesture.y);
    if (Math.max(dx, dy) >= DIRECTION_THRESHOLD) {
      this.ignoreTapUntil = performance.now() + TAP_SUPPRESSION_DURATION;
    }
    if (!gesture.horizontal) {
      if (Math.max(dx, dy) < DIRECTION_THRESHOLD) return;
      if (dx <= dy * HORIZONTAL_RATIO) {
        this.cancelSwipe();
        return;
      }
      gesture.horizontal = true;
    }

    if (event.cancelable) event.preventDefault();
  }

  protected endSwipe(event: TouchEvent): void {
    const gesture = this.gesture;
    this.cancelSwipe();
    if (!this.appCalendarSwipe() || !gesture?.horizontal) return;
    this.ignoreTapUntil = performance.now() + TAP_SUPPRESSION_DURATION;
    if (event.cancelable) event.preventDefault();

    const touch = Array.from(event.changedTouches).find(
      item => item.identifier === gesture.identifier,
    );
    if (!touch || event.touches.length) return;
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (
      Math.abs(dx) >= MIN_DISTANCE &&
      Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO &&
      event.timeStamp - gesture.startedAt <= MAX_DURATION
    ) {
      this.swipe.emit(dx < 0 ? 'next' : 'prev');
    }
  }

  protected cancelSwipe(): void {
    this.gesture = null;
  }
}
