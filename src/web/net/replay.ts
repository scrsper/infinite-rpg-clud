import type { CharacterChoice, GameLink, LinkEvents, LinkStatus } from './connection';
import type { HelloMessage, InteractionCommand, ResultMessage } from './messages';

/**
 * A recorded, observer-filtered stream played back through the same `GameLink` surface as a live
 * connection. It exists so the renderer, camera, UI and screenshots can be developed and compared
 * without a second controller on a world. Commands are accepted and discarded (nothing is sent
 * anywhere); local_state frames arrive at their recorded times and, when the recording ends, loop.
 */
export interface RecordedFrame { t: number; m: { type: string; [k: string]: any } }
export class ReplayConnection implements GameLink {
  status: LinkStatus = 'idle';
  hello: HelloMessage | null = null;
  rttMs = 0;
  private readonly handlers = new Map<string, Set<(v: never) => void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frames: RecordedFrame[] = [];
  private index = 0;
  private startedAt = 0;
  private sequence = 0;
  constructor(private readonly url: string, private readonly loop = true) {}

  on<K extends keyof LinkEvents>(event: K, handler: (v: LinkEvents[K]) => void): () => void {
    let set = this.handlers.get(event); if (!set) this.handlers.set(event, set = new Set());
    set.add(handler as (v: never) => void); return () => set!.delete(handler as (v: never) => void);
  }
  private emit<K extends keyof LinkEvents>(event: K, value: LinkEvents[K]): void { for (const h of [...(this.handlers.get(event) ?? [])]) (h as (v: LinkEvents[K]) => void)(value); }

  connect(_choice: CharacterChoice): void {
    this.status = 'connecting'; this.emit('status', this.status);
    fetch(this.url).then(r => r.json()).then((j: { frames: RecordedFrame[] }) => { this.frames = j.frames; this.index = 0; this.startedAt = performance.now(); this.pump(); });
  }
  disconnect(): void { if (this.timer) clearTimeout(this.timer); this.status = 'idle'; this.emit('status', this.status); }
  private pump(): void {
    const now = performance.now() - this.startedAt;
    while (this.index < this.frames.length && this.frames[this.index].t <= now) this.dispatch(this.frames[this.index++].m);
    if (this.index >= this.frames.length) {
      if (!this.loop) return;
      // Loop only the movement stream so the world stays built.
      this.index = this.frames.findIndex(f => f.m.type === 'local_state'); this.startedAt = performance.now() - (this.frames[this.index]?.t ?? 0);
    }
    this.timer = setTimeout(() => this.pump(), 4);
  }
  private dispatch(m: RecordedFrame['m']): void {
    switch (m.type) {
      case 'hello': this.hello = m as HelloMessage; this.status = 'live'; this.emit('status', this.status); this.emit('hello', m as HelloMessage); break;
      case 'scene': this.emit('scene', m as never); break;
      case 'snapshot': this.emit('snapshot', m as never); break;
      case 'local_state': this.emit('local_state', m as never); break;
      case 'regions_state': this.emit('regions_state', m as never); break;
      case 'combat_frame': this.emit('combat_frame', m as never); break;
      case 'presentation': this.emit('presentation', { regionId: m.regionId, payload: m.payload, applied: () => undefined }); break;
      default: break;
    }
  }
  sendCommand(_command: InteractionCommand): { commandId: string; sequence: number; clientTimeMs: number } | null {
    const sequence = this.sequence++; return { commandId: `replay-${sequence}`, sequence, clientTimeMs: performance.now() };
  }
  intent(_body: Record<string, unknown>): Promise<ResultMessage> { return Promise.resolve({ type: 'result', sequence: ++this.sequence, result: 'replay' }); }
  requestSave(): Promise<ResultMessage> { return Promise.resolve({ type: 'result', sequence: ++this.sequence, result: 'replay' }); }
}
