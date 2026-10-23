import { DestroyRef, inject, Service } from '@angular/core';
import { Observable } from 'rxjs';

export type TabEvent =
  | { type: 'login' }
  | { type: 'logout' }
  | { type: 'theme'; value: string }
  | { type: 'lang'; value: string };

@Service()
export class TabSyncService {
  private readonly channel = new BroadcastChannel('app');

  incoming = new Observable<TabEvent>(subscriber => {
    const handler = (event: MessageEvent<TabEvent>) => subscriber.next(event.data);

    this.channel.addEventListener('message', handler);

    return () => this.channel.removeEventListener('message', handler);
  });

  // LIFECYCLE
  constructor() {
    inject(DestroyRef).onDestroy(() => this.channel.close());
  }

  // ACTIONS
  send(event: TabEvent): void {
    this.channel.postMessage(event);
  }
}
