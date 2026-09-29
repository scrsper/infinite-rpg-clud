import { add, clear, h } from './dom';
import { clockText, daypart, pct, titleCase } from '../game/text';

/**
 * The always-on layer: vitals, place and time, connection, the contextual prompt, the locked
 * target, toasts, subtitles and first-steps hints. It shows what the projection says and carries
 * no state the world does not: a hunger meter is the body's hunger, a toast is a result code.
 */
export type ToastTone = 'info' | 'good' | 'bad' | 'veil';
export interface VitalsView { health: number; maxHealth: number; effort: number; hunger: number; thirst: number; tiredness: number; wealth: number }
export interface PromptView { keyLabel: string; text: string; why?: string }

export class Hud {
  readonly root: HTMLElement;
  private readonly healthBar: HTMLElement; private readonly effortBar: HTMLElement;
  private readonly needs: HTMLElement;
  private readonly place: HTMLElement; private readonly time: HTMLElement; private readonly net: HTMLElement; private readonly wealth: HTMLElement;
  private readonly promptEl: HTMLElement; private readonly targetEl: HTMLElement; private readonly toasts: HTMLElement; private readonly subtitle: HTMLElement; private readonly hints: HTMLElement;
  private readonly reticle: HTMLElement;
  private readonly plates: HTMLElement;
  private lastPrompt = ''; private lastNeeds = '';

  constructor(parent: HTMLElement) {
    this.healthBar = h('div', { class: 'tv-bar' }, h('i'), h('b', { text: 'Health' }));
    this.effortBar = h('div', { class: 'tv-bar effort' }, h('i'), h('b', { text: 'Effort' }));
    this.needs = h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap' });
    this.place = h('div', { class: 'place', text: '' }); this.time = h('div', { class: 'time', text: '' }); this.net = h('div', { class: 'net', text: '' }); this.wealth = h('div', { class: 'tv-sub', text: '' });
    this.promptEl = h('div', { class: 'tv-prompt', style: 'display:none', role: 'status' });
    this.targetEl = h('div', { class: 'tv-target', style: 'display:none' });
    this.toasts = h('div', { class: 'tv-toasts', role: 'log', aria: { live: 'polite' } });
    this.subtitle = h('div', { class: 'tv-subtitle', style: 'display:none', role: 'status' });
    this.hints = h('div', { class: 'tv-hints' });
    this.reticle = h('div', { class: 'tv-reticle', style: 'display:none' });
    this.plates = h('div', { class: 'tv-layer', style: 'overflow:hidden' });
    this.root = h('div', { class: 'tv-hud hidden' },
      this.plates,
      h('div', { class: 'tv-vitals' }, this.healthBar, this.effortBar, this.needs, this.wealth),
      h('div', { class: 'tv-status' }, this.place, this.time, this.net),
      this.hints, this.targetEl, this.promptEl, this.subtitle, this.toasts, this.reticle);
    parent.append(this.root);
  }
  get plateLayer(): HTMLElement { return this.plates; }
  show(on: boolean): void { this.root.classList.toggle('hidden', !on); }

  setVitals(v: VitalsView): void {
    const set = (bar: HTMLElement, f: number) => { (bar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, f)) * 100}%`; bar.classList.toggle('low', f < 0.25); };
    set(this.healthBar, v.maxHealth > 0 ? v.health / v.maxHealth : 1); set(this.effortBar, v.effort);
    this.healthBar.setAttribute('aria-label', `Health ${Math.round(v.health)} of ${Math.round(v.maxHealth)}`);
    const chips: [string, number][] = [['Hungry', v.hunger], ['Thirsty', v.thirst], ['Tired', v.tiredness]];
    const sig = chips.map(([n, x]) => (x > 0.35 ? `${n}${x > 0.7 ? '!' : ''}` : '')).join('|');
    if (sig !== this.lastNeeds) {
      this.lastNeeds = sig; clear(this.needs);
      for (const [n, x] of chips) if (x > 0.35) this.needs.append(h('span', { class: `tv-chip ${x > 0.7 ? 'tv-bad' : 'tv-warn'}`, text: n }));
    }
    this.wealth.textContent = `${Math.round(v.wealth)} silver`;
  }
  setPlace(place: string, worldSeconds: number, weather: string): void {
    const c = clockText(worldSeconds);
    this.place.textContent = place; this.time.textContent = `${c.text} · ${daypart(c.hour)}${weather && weather !== 'clear' ? ` · ${titleCase(weather)}` : ''}`;
  }
  setNet(text: string, bad: boolean): void { this.net.textContent = text; this.net.classList.toggle('bad', bad); }

  setPrompt(p: PromptView | null): void {
    const sig = p ? `${p.keyLabel}|${p.text}|${p.why ?? ''}` : '';
    if (sig === this.lastPrompt) return; this.lastPrompt = sig;
    if (!p) { this.promptEl.style.display = 'none'; return; }
    clear(this.promptEl); this.promptEl.style.display = 'flex';
    add(this.promptEl, p.keyLabel ? h('span', { class: 'tv-key', text: p.keyLabel }) : null, h('span', { text: p.text }), p.why ? h('span', { class: 'why', text: p.why }) : null);
  }
  setTarget(t: { name: string; frac?: number; note?: string } | null): void {
    if (!t) { this.targetEl.style.display = 'none'; return; }
    this.targetEl.style.display = 'block'; clear(this.targetEl);
    add(this.targetEl, h('div', { class: 'name', text: t.name }), t.note ? h('div', { class: 'tv-sub', text: t.note }) : null,
      t.frac !== undefined ? h('div', { class: 'tv-bar' }, h('i', { style: { width: `${Math.max(0, Math.min(1, t.frac)) * 100}%` } })) : null);
  }
  toast(text: string, tone: ToastTone = 'info', ms = 4200): void {
    const el = h('div', { class: `tv-toast ${tone === 'info' ? '' : tone}`, text });
    this.toasts.append(el); while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 420); }, ms);
  }
  setSubtitle(who: string | null, text: string | null): void {
    if (!text) { this.subtitle.style.display = 'none'; return; }
    this.subtitle.style.display = 'block'; clear(this.subtitle); add(this.subtitle, who ? h('b', { text: `${who}: ` }) : null, document.createTextNode(text));
  }
  setHints(lines: { key: string; text: string }[]): void {
    clear(this.hints); for (const l of lines) this.hints.append(h('div', null, h('span', { class: 'tv-key', text: l.key }), l.text));
  }
  setReticle(at: { x: number; y: number } | null): void {
    if (!at) { this.reticle.style.display = 'none'; return; }
    this.reticle.style.display = 'block'; this.reticle.style.left = `${at.x}px`; this.reticle.style.top = `${at.y}px`;
  }
  pctText(v: number): string { return pct(v); }
}
