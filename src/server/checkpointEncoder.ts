import { Worker } from 'node:worker_threads';

/** One bounded worker per service. Input chunks are drained synchronously; only lossless storage
 * packing runs concurrently. A failed worker rejects the checkpoint, leaving CURRENT untouched. */
export class CheckpointEncoder {
  private worker?: Worker;
  private failure?: Error;
  private closed = false;
  private recycledInput?: ArrayBuffer;
  lastCaptureMs = 0;
  lastTransferMs = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: { resolve: (value: { bytes: Buffer; encodeMs: number }) => void; reject: (error: Error) => void };
  /** Reserve and touch owned storage while the service is loading, before it accepts
   * players. No world is captured here; all serialization remains inside encode's timer. */
  prepare(sizeHint: number): number {
    if (this.closed || this.failure) throw this.failure ?? new Error('Checkpoint encoder closed');
    if (this.pending) throw new Error('Checkpoint encoding already in flight');
    this.startWorker();
    const capacity = this.capacityFor(sizeHint);
    if (!this.recycledInput || this.recycledInput.byteLength < capacity)
      this.recycledInput = Buffer.allocUnsafeSlow(capacity).buffer as ArrayBuffer;
    Buffer.from(this.recycledInput).fill(0);
    return this.recycledInput.byteLength;
  }
  private capacityFor(hint: number): number {
    return Math.max(1, Math.ceil(Math.max(0, Number.isFinite(hint) ? hint : 0) * 1.125 / 1048576)) * 1048576;
  }
  private startWorker(): void {
    if (!this.worker) {
      const source = import.meta.url.endsWith('.ts');
      this.worker = new Worker(new URL(source ? './checkpointWorkerLoader.mjs' : './checkpointWorker.mjs', import.meta.url), {
        // Source workers bootstrap their loader inside a JavaScript entry on Node 20 and newer.
        execArgv: [],
      });
      this.worker.on('message', value => {
        clearTimeout(this.timer);
        const pending = this.pending; this.pending = undefined;
        if (!pending) return;
        // The worker returns ownership only after parsing/packing has finished. Keep one
        // allocation for the next capture; neither the live world nor stored output shares it.
        if (!this.closed && value.inputBuffer instanceof ArrayBuffer) this.recycledInput = value.inputBuffer;
        if (value.error) pending.reject(new Error(value.error));
        else pending.resolve({ bytes: Buffer.from(value.bytes.buffer, value.bytes.byteOffset, value.bytes.byteLength), encodeMs: value.encodeMs });
      });
      const fail = (error: Error) => { clearTimeout(this.timer); this.failure = error; this.recycledInput = undefined; const pending = this.pending; this.pending = undefined; pending?.reject(error); };
      this.worker.on('error', fail);
      this.worker.on('exit', code => { this.worker = undefined; fail(new Error(`Checkpoint encoder exited (${code})`)); });
    }
  }
  encode(snapshot: string | Iterable<string>, sizeHint = 0): Promise<{ bytes: Buffer; encodeMs: number }> {
    const start = performance.now();
    if (this.closed || this.failure) throw this.failure ?? new Error('Checkpoint encoder closed');
    if (this.pending) throw new Error('Checkpoint encoding already in flight');
    this.startWorker();
    // Consume every chunk synchronously before posting or returning. Only the current JSON
    // chunk stays live, rather than retaining an entire second string copy of world history.
    const parts = typeof snapshot === 'string' ? [snapshot] : snapshot;
    const recycled = this.recycledInput; this.recycledInput = undefined;
    const initial = typeof snapshot === 'string' ? Buffer.byteLength(snapshot) : Math.max(0, Number.isFinite(sizeHint) ? sizeHint : 0);
    const capacity = this.capacityFor(initial);
    let buffer = recycled ? Buffer.from(recycled) : Buffer.allocUnsafeSlow(capacity);
    let offset = 0;
    try {
      for (const part of parts) {
        const length = Buffer.byteLength(part), required = offset + length;
        if (required > buffer.length) {
          const grown = Buffer.allocUnsafeSlow(Math.max(buffer.length * 2, Math.ceil(required * 1.125 / 1048576) * 1048576));
          buffer.copy(grown, 0, 0, offset); buffer = grown;
        }
        if (buffer.write(part, offset, length) !== length) throw new Error('Incomplete checkpoint UTF-8 capture');
        offset += length;
      }
    } catch (error) {
      this.recycledInput = buffer.buffer as ArrayBuffer;
      throw error;
    }
    const bytes = buffer.subarray(0, offset), capturedAt = performance.now();
    this.lastCaptureMs = capturedAt - start;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.timer = setTimeout(() => {
        this.failure = new Error('Checkpoint encoding exceeded 60 seconds');
        this.pending = undefined; reject(this.failure); void this.worker?.terminate();
      }, 60_000);
      try { this.worker!.postMessage(bytes, [bytes.buffer]); this.lastTransferMs = performance.now() - capturedAt; }
      catch (error) {
        clearTimeout(this.timer); this.pending = undefined;
        if (bytes.buffer.byteLength) this.recycledInput = bytes.buffer as ArrayBuffer;
        reject(error as Error);
      }
    });
  }
  async close(): Promise<void> { this.closed = true; this.recycledInput = undefined; await this.worker?.terminate(); }
}
