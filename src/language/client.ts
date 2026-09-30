export interface LocalConfig { enabled: boolean; baseUrl: string; model: string; timeoutMs: number; maxTokens: number; temperature: number; concurrency: number }
export const DEFAULT_LOCAL_CONFIG: LocalConfig = { enabled: true, baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b', timeoutMs: 30000, maxTokens: 384, temperature: .2, concurrency: 1 };
export function validateConfig(input: LocalConfig): LocalConfig {
  const u = new URL(input.baseUrl);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !['', '/', '/v1', '/v1/'].includes(u.pathname)) throw new Error('Only local loopback HTTP endpoints, with optional /v1, are supported');
  if (typeof input.enabled !== 'boolean' || typeof input.model !== 'string' || input.model.length < 1 || input.model.length > 160 || !/^[\w./:@-]+$/.test(input.model) || /(?:[:/-]cloud)(?:$|[:/-])/i.test(input.model)) throw new Error('Invalid local model (cloud models are not supported)');
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 500 || input.timeoutMs > 120000 || !Number.isInteger(input.maxTokens) || input.maxTokens < 64 || input.maxTokens > 1024 || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 1 || ![1, 2].includes(input.concurrency)) throw new Error('Invalid language limits');
  return { ...input, baseUrl: `${u.origin}/v1` };
}
export interface Completion { raw: string; latencyMs: number; firstTokenMs: number | null; tokens: number | null; queueMs: number }
type Job = { run: () => Promise<void>; reject: (e: Error) => void; signal?: AbortSignal; cancel: () => void };
export class LocalLanguageClient {
  private active = 0;
  private queue: Job[] = [];
  private controllers = new Set<AbortController>();
  config: LocalConfig;
  completed = 0;
  constructor(config = DEFAULT_LOCAL_CONFIG, private readonly fetcher: typeof fetch = fetch) { this.config = validateConfig(config); }
  get status() { return { active: this.active, queueDepth: this.queue.length, completed: this.completed }; }
  configure(config: LocalConfig) { this.cancelAll(); this.config = validateConfig(config); }
  cancelAll() { for (const c of this.controllers) c.abort(); for (const j of this.queue.splice(0)) { j.signal?.removeEventListener('abort', j.cancel); j.reject(new Error('Cancelled')); } }
  async probe() {
    try {
      const response = await this.fetcher(`${this.config.baseUrl}/models`, { signal: AbortSignal.timeout(2500), redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { data?: { id: string }[] };
      const models = (body.data ?? []).map(m => m.id).filter(x => typeof x === 'string');
      return { online: true, models, configuredModelInstalled: models.includes(this.config.model), error: null };
    } catch (e) { return { online: false, models: [] as string[], configuredModelInstalled: false, error: String(e) }; }
  }
  complete(system: string, data: unknown, signal?: AbortSignal): Promise<Completion> {
    if (!this.config.enabled) return Promise.reject(new Error('Local model disabled'));
    if (signal?.aborted) return Promise.reject(new Error('Cancelled'));
    if (this.queue.length >= 8) return Promise.reject(new Error('Language queue full'));
    const queued = performance.now(), config = { ...this.config };
    return new Promise((resolve, reject) => {
      const job: Job = { reject, signal, cancel: () => { const i = this.queue.indexOf(job); if (i >= 0) { this.queue.splice(i, 1); reject(new Error('Cancelled')); } }, run: async () => {
        signal?.removeEventListener('abort', job.cancel);
        const controller = new AbortController(); this.controllers.add(controller);
        const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) controller.abort();
        const timer = setTimeout(abort, config.timeoutMs), start = performance.now();
        try {
          const response = await this.fetcher(`${config.baseUrl}/chat/completions`, {
            method: 'POST', signal: controller.signal, redirect: 'error', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(data) }], temperature: config.temperature, max_tokens: config.maxTokens, reasoning_effort: 'none', stream: true, stream_options: { include_usage: true }, response_format: { type: 'json_object' } }),
          });
          if (!response.ok || !response.body) throw new Error(`Local model HTTP ${response.status}`);
          let raw = '', firstTokenMs: number | null = null, tokens: number | null = null, size = 0;
          const consume = (obj: any) => {
            const choice = obj.choices?.[0];
            if (choice?.delta?.tool_calls || choice?.message?.tool_calls || choice?.finish_reason === 'tool_calls') throw new Error('Tool output rejected');
            const s = choice?.delta?.content ?? choice?.message?.content;
            if (typeof s === 'string' && s.length) { firstTokenMs ??= performance.now() - start; raw += s; if (raw.length > 16384) throw new Error('Model content too large'); }
            if (typeof obj.usage?.completion_tokens === 'number') tokens = obj.usage.completion_tokens;
          };
          const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
          const streaming = response.headers.get('content-type')?.includes('text/event-stream');
          try {
            while (true) {
              const { value, done } = await reader.read(); if (done) break;
              // SSE repeats a sizeable JSON envelope per token; its wire size is not content size.
              size += value.byteLength; if (size > 1048576) throw new Error('Model response too large');
              pending += decoder.decode(value, { stream: true });
              if (streaming) {
                const lines = pending.split('\n'); pending = lines.pop()!;
                for (const line of lines) if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') consume(JSON.parse(d)); }
              }
            }
            pending += decoder.decode();
            if (!streaming) consume(JSON.parse(pending));
            else if (pending.startsWith('data:') && pending.slice(5).trim() !== '[DONE]') consume(JSON.parse(pending.slice(5)));
          } finally { await reader.cancel().catch(() => {}); }
          if (!raw) throw new Error('Model returned no speech JSON');
          this.completed++; resolve({ raw, latencyMs: performance.now() - start, firstTokenMs: streaming ? firstTokenMs : null, tokens, queueMs: start - queued });
        } catch (e) { reject(e); }
        finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.controllers.delete(controller); }
      } };
      signal?.addEventListener('abort', job.cancel, { once: true }); this.queue.push(job); this.pump();
    });
  }
  private pump() {
    while (this.active < this.config.concurrency && this.queue.length) {
      const job = this.queue.shift()!; this.active++;
      void job.run().finally(() => { this.active--; this.pump(); });
    }
  }
}

/** Exactly one repair; neither failed text nor model instructions are inserted into the repair prompt. */
export async function validatedCompletion<T>(client: LocalLanguageClient, system: string, data: unknown, validate: (value: unknown) => T, fallback: T, signal?: AbortSignal) {
  const attempts: (Completion & { error?: string })[] = [];
  for (let i = 0; i < 2; i++) {
    let completion: Completion;
    try { completion = await client.complete(system + (i ? '\nREPAIR: Return only exact valid JSON matching the supplied schema and allowed values. /no_think' : '\n/no_think'), data, signal); }
    catch (e) { return { output: fallback, fallback: true, reason: String(e), attempts }; }
    try { const output = validate(JSON.parse(completion.raw)); attempts.push(completion); return { output, fallback: false, reason: null, attempts }; }
    catch (e) { attempts.push({ ...completion, error: String(e) }); }
  }
  return { output: fallback, fallback: true, reason: 'Rejected model output after one repair', attempts };
}
