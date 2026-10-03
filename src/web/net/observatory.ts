import type { CharacterChoice, GameLink, LinkEvents, LinkStatus } from './connection';
import type { HelloMessage, InteractionCommand, ResultMessage } from './messages';

/** Same-origin, token-authenticated adapter for the isolated developer workbench. */
export class ObservatoryConnection implements GameLink {
  status: LinkStatus = 'idle'; hello: HelloMessage | null = null; rttMs = 0; playable = false;
  private handlers = new Map<string, Set<(v: any) => void>>();
  private lease = ''; private generation = 0; private sequence = 0; private intentSequence = 0;
  private regionId = ''; private pending = 0; private lastGeometry = -Infinity;
  private token = window.parent.document.querySelector<HTMLMetaElement>('meta[name="observatory-token"]')?.content ?? '';
  constructor() {
    window.addEventListener('pagehide', () => this.disconnect());
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== parent) return;
      if (event.data?.type === 'observatory-close') this.disconnect();
    });
  }
  on<K extends keyof LinkEvents>(event: K, handler: (v: LinkEvents[K]) => void) {
    let set = this.handlers.get(event); if (!set) this.handlers.set(event, set = new Set());
    set.add(handler); return () => { set!.delete(handler); };
  }
  private emit<K extends keyof LinkEvents>(event: K, value: LinkEvents[K]) { for (const h of this.handlers.get(event) ?? []) h(value); }
  private async api(path: string, body?: unknown) {
    const r = await fetch('/api/viewport/' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Observatory-Token': this.token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await r.json(); if (!r.ok) throw new Error(result.error ?? `HTTP ${r.status}`); return result;
  }
  connect(_choice: CharacterChoice) {
    const generation = ++this.generation; this.status = 'connecting'; this.emit('status', this.status);
    this.api('connect', { personId: new URLSearchParams(location.search).get('person') }).then(async data => {
      if (generation !== this.generation) { await this.api('disconnect', { lease: data.lease }); return; }
      this.lease = data.lease; this.hello = data.hello; this.regionId = ''; this.lastGeometry = -Infinity;
      this.status = 'live'; this.emit('status', this.status); this.emit('hello', data.hello); this.emit('scene', data.scene);
      await this.poll(generation);
    }).catch(e => this.fail(e, generation));
  }
  private fail(e: unknown, generation: number) {
    if (generation !== this.generation) return;
    this.playable = false; this.status = 'closed'; this.emit('status', this.status);
    this.emit('closed', { code: 1000, reason: String(e), kind: 'other', final: true });
    parent.postMessage({ type: 'observatory-viewport-error', message: String(e) }, location.origin);
  }
  private async poll(generation: number) {
    while (generation === this.generation && this.status === 'live') {
      const start = performance.now();
      const frame = await this.api(`frame?lease=${encodeURIComponent(this.lease)}`);
      if (generation !== this.generation) return;
      this.rttMs = performance.now() - start; this.playable = !frame.paused && !frame.busy && frame.speed === 1;
      if (this.hello?.interaction?.epoch !== frame.hello.interaction?.epoch) { this.sequence = 0; this.hello = frame.hello; this.emit('hello', frame.hello); }
      // A completed advance or a changed region rebuilds canonical static geometry too.
      if (this.regionId !== frame.regionId || Math.abs(frame.snapshot.worldTime - this.lastGeometry) >= 3600) {
        const region = await this.api(`region?lease=${encodeURIComponent(this.lease)}&id=${encodeURIComponent(frame.regionId)}`);
        if (generation !== this.generation) return;
        const old = this.regionId; this.regionId = frame.regionId; this.lastGeometry = frame.snapshot.worldTime;
        this.emit('regions_state', { type: 'regions_state', origin: { x: 0, y: 0, z: 0 }, resident: [this.regionId], unload: old && old !== this.regionId ? [old] : [] } as LinkEvents['regions_state']);
        await new Promise<void>(resolve => this.emit('presentation', { regionId: this.regionId, payload: { regions: [region], dynamic: frame.dynamic }, applied: resolve }));
      } else this.emit('presentation', { regionId: this.regionId, payload: { regions: [], dynamic: frame.dynamic }, applied: () => {} });
      if (frame.local) this.emit('local_state', frame.local);
      for (const receipt of frame.receipts) this.emit('receipt', receipt);
      this.emit('snapshot', frame.snapshot);
      parent.postMessage({ type: 'observatory-viewport-status', paused: frame.paused, busy: frame.busy, playable: this.playable, personId: frame.hello.playerId }, location.origin);
      await new Promise(resolve => setTimeout(resolve, 75));
    }
  }
  disconnect() {
    ++this.generation; this.playable = false; this.status = 'idle'; this.emit('status', this.status);
    const lease = this.lease; this.lease = '';
    if (lease) void fetch('/api/viewport/disconnect', { method: 'POST', keepalive: true,
      headers: { 'X-Observatory-Token': this.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ lease }) }).catch(() => {});
  }
  sendCommand(command: InteractionCommand) {
    const b = this.hello?.interaction; if (!b || !this.playable || this.pending >= 4) return null;
    const sequence = this.sequence++, commandId = `${b.controllerId}-${sequence}`, clientTimeMs = Math.round(performance.now());
    this.pending++;
    void this.api('command', { lease: this.lease, command: { version: 2, type: 'command', ...b, sequence, commandId, clientTimeMs, command } })
      .then(receipt => { if (receipt) this.emit('receipt', receipt); }).catch(() => { this.playable = false; }).finally(() => this.pending--);
    return { commandId, sequence, clientTimeMs };
  }
  async intent(body: Record<string, unknown>): Promise<ResultMessage> {
    const sequence = ++this.intentSequence;
    try { return { type: 'result', ...await this.api('intent', { lease: this.lease, intent: { ...body, version: 1, sequence } }) }; }
    catch { return { type: 'result', sequence, result: 'not_connected' }; }
  }
  requestSave() { return this.intent({ type: 'save' }); }
}
