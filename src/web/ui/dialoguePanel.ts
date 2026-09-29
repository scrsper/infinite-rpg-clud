import { clear, h } from './dom';
import type { DialogueProjection } from '../net/messages';

/**
 * Conversation with a person. The transcript is what was actually said (their lines from the
 * projection, and the choices the player made); the options are exactly the ones the dialogue system
 * offers, grouped by what they do so a long menu reads as a few intentions, not a wall. Anything that
 * spends silver or commits the player asks for a confirmation first; every option id is revision-fenced
 * by the server, so a stale click is refused there and reported here instead of acting on old state.
 */
export interface PortraitSource { attach(canvas: HTMLCanvasElement, bodyId: string | null, name: string): () => void }
export interface DialogueDeps {
  choose(optionId: string, label: string): Promise<{ result: string }>;
  close(): void;
  portrait: PortraitSource;
  keyLabel(n: number): string;
  toast(text: string, tone?: 'info' | 'good' | 'bad' | 'veil'): void;
  describe(result: string): string;
}

type GroupId = 'talk' | 'trade' | 'work' | 'teach' | 'favour' | 'leave' | 'more';
const GROUPS: { id: GroupId; title: string }[] = [
  { id: 'talk', title: 'Conversation' }, { id: 'trade', title: 'Trade' }, { id: 'work', title: 'Work & favours' }, { id: 'teach', title: 'Learning & sparring' },
  { id: 'favour', title: 'Give & tell' }, { id: 'more', title: 'Other' }, { id: 'leave', title: 'Leave' },
];
export function classify(label: string): GroupId {
  const l = label.trim();
  if (/^(goodbye|leave|never mind|not today|nothing today|go on \(close\)|suit yourself)/i.test(l)) return 'leave';
  if (/^(trade|buy |sell |more goods|back to the first goods)/i.test(l)) return 'trade';
  if (/^(any work|carry |deal with|anything else\?|about the )/i.test(l)) return 'work';
  if (/^(spar|teach me)/i.test(l)) return 'teach';
  if (/^(give |pay |tell them|apologi[sz]e)/i.test(l)) return 'favour';
  if (/^(what's|what is|who are|introduce|what do you|ask about|is there anything)/i.test(l)) return 'talk';
  return 'more';
}
/**
 * The price shown in the row, split from the label. The dialogue system words prices as "(3s)", "(3s, 9 to be had)"
 * or "(4s each, 9 to be had)", and a sale as "Sell bread (2s)": the words stay as the server wrote them, the price and any
 * stock note are lifted out into their own columns.
 *   "Buy a meal — stew (3s)"               -> text "Buy a meal — stew", price "3 silver"
 *   "Buy bread (4s each, 9 to be had)"     -> text "Buy bread", price "4 silver each", note "9 to be had"
 *   "Sell bread (2s)"                      -> text "Sell bread", price "+2 silver"
 */
export function splitPrice(label: string): { text: string; price: string | null; note: string | null } {
  const sell = /^(Sell .*?)\s*\((\d+)s\)\s*$/.exec(label); if (sell) return { text: sell[1], price: `+${sell[2]} silver`, note: null };
  const m = /^(.*?)\s*\((\d+)s(\s+each)?(?:,\s*([^)]*))?\)\s*$/.exec(label); if (m) return { text: m[1], price: `${m[2]} silver${m[3] ? ' each' : ''}`, note: m[4]?.trim() || null };
  const r = /^(.*)\((\d+)s\)(.*)$/.exec(label); if (r) return { text: (r[1] + r[3]).trim(), price: `${r[2]} silver`, note: null };
  return { text: label, price: null, note: null };
}
export const needsConfirm = (label: string): boolean => /^(buy |sell |pay |teach me|carry |deal with)/i.test(label.trim()) && /\(\d+s\b/.test(label);

export class DialoguePanel {
  readonly root: HTMLElement;
  private readonly transcript: HTMLElement; private readonly options: HTMLElement; private readonly confirmEl: HTMLElement; private readonly portrait: HTMLElement; private readonly title: HTMLElement;
  private readonly log: { who: string; text: string; you: boolean }[] = [];
  private revision = -1; private speakerBodyId: string | null = null; private current: DialogueProjection | null = null;
  private busy = false; private detach: (() => void) | null = null; private pendingLabel = '';
  constructor(parent: HTMLElement, private readonly deps: DialogueDeps) {
    this.title = h('div', { class: 'tv-h2', style: 'margin:0' });
    this.transcript = h('div', { class: 'tv-transcript', tabindex: 0, aria: { label: 'Conversation' } });
    this.options = h('div', { class: 'tv-options' });
    this.confirmEl = h('div');
    this.portrait = h('figure', { class: 'tv-portrait', style: 'margin:0' });
    this.root = h('div', { class: 'tv-talk tv-panel', style: 'display:none', role: 'dialog', aria: { label: 'Conversation' } }, this.portrait,
      h('div', { style: 'min-width:0' }, this.title, this.transcript, this.confirmEl, this.options));
    parent.append(this.root);
    window.addEventListener('keydown', e => this.onKey(e));
  }
  get isOpen(): boolean { return this.current !== null; }
  get speaker(): string | null { return this.speakerBodyId; }
  get scope(): HTMLElement { return this.root; }

  private onKey(e: KeyboardEvent): void {
    if (!this.current || this.busy) return;
    const a = document.activeElement as HTMLElement | null; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    const n = e.key >= '1' && e.key <= '9' ? Number(e.key) : 0;
    if (n) { const btn = this.options.querySelectorAll<HTMLButtonElement>('button.tv-opt')[n - 1]; if (btn) { e.preventDefault(); btn.click(); } }
  }

  /** Feed the latest projection (or null when no conversation is open). */
  update(d: DialogueProjection | null): void {
    if (!d) { if (this.current) this.closeUi(); return; }
    const isNew = !this.current || d.speakerBodyId !== this.speakerBodyId;
    if (isNew) { this.log.length = 0; this.openUi(d); }
    if (d.revision !== this.revision) {
      if (this.pendingLabel) { this.log.push({ who: 'You', text: this.pendingLabel, you: true }); this.pendingLabel = ''; }
      for (const line of d.lines) this.log.push({ who: d.name, text: line, you: false });
      while (this.log.length > 30) this.log.shift();
      this.revision = d.revision; this.current = d; this.confirmEl.replaceChildren();
      this.renderAll(d);
    }
  }
  private openUi(d: DialogueProjection): void {
    this.current = d; this.speakerBodyId = d.speakerBodyId; this.revision = -1; this.root.style.display = 'grid';
    clear(this.portrait); const canvas = h('canvas', { width: 320, height: 400, 'aria-hidden': 'true' }); this.portrait.append(canvas, h('figcaption', { text: d.name }));
    this.detach = this.deps.portrait.attach(canvas, d.speakerBodyId, d.name);
  }
  private closeUi(): void {
    this.detach?.(); this.detach = null; this.current = null; this.speakerBodyId = null; this.revision = -1; this.pendingLabel = ''; this.root.style.display = 'none'; this.busy = false;
  }
  /** Close from the player's side (Escape / B). The server is told; the panel hides when the projection clears. */
  requestClose(): void { if (this.current) this.deps.close(); }

  private renderAll(d: DialogueProjection): void {
    this.title.textContent = d.name;
    clear(this.transcript);
    for (const l of this.log) this.transcript.append(h('div', { class: `tv-line${l.you ? ' you' : ''}` }, h('span', { class: 'who', text: l.who }), l.text));
    this.transcript.scrollTop = this.transcript.scrollHeight;
    clear(this.options);
    let n = 0;
    const buckets = new Map<GroupId, { id: string; label: string }[]>();
    for (const o of d.options) { const g = classify(o.label); (buckets.get(g) ?? buckets.set(g, []).get(g)!).push(o); }
    for (const g of GROUPS) {
      const list = buckets.get(g.id); if (!list?.length) continue;
      const box = h('div', { class: 'list' });
      for (const o of list) {
        n++; const { text, price, note } = splitPrice(o.label);
        box.append(h('button', { class: 'tv-opt', type: 'button', ...(n === 1 ? { 'data-autofocus': '1' } : {}), on: { click: () => this.pick(o) } },
          n <= 9 ? h('span', { class: 'tv-key', text: String(n) }) : null, h('span', { text }), note ? h('span', { class: 'tv-muted', style: 'margin-left:auto;padding-right:.6rem', text: note }) : null, price ? h('span', { class: 'price', text: price }) : null));
      }
      this.options.append(h('div', { class: 'tv-opt-group' }, h('h4', { text: g.title }), box));
    }
    queueMicrotask(() => { (this.options.querySelector('button.tv-opt') as HTMLElement | null)?.focus({ preventScroll: true }); });
  }

  private pick(o: { id: string; label: string }): void {
    if (this.busy) return;
    if (needsConfirm(o.label)) {
      const { text, price } = splitPrice(o.label), rev = this.revision;
      this.confirmEl.replaceChildren(h('div', { class: 'tv-confirm', role: 'alertdialog' }, h('div', { class: 'grow' }, h('div', { class: 'tv-gold', text: 'Confirm' }), h('div', { text: price ? `${text} for ${price}?` : `${text}?` })),
        h('button', { class: 'tv-btn primary', type: 'button', 'data-autofocus': '1', on: { click: () => { if (this.revision !== rev) { this.confirmEl.replaceChildren(); this.deps.toast('That offer changed; look again.', 'bad'); return; } void this.send(o); } } }, 'Confirm'),
        h('button', { class: 'tv-btn', type: 'button', on: { click: () => { this.confirmEl.replaceChildren(); (this.options.querySelector('button.tv-opt') as HTMLElement | null)?.focus(); } } }, 'Not now')));
      (this.confirmEl.querySelector('button') as HTMLElement | null)?.focus(); return;
    }
    void this.send(o);
  }
  private async send(o: { id: string; label: string }): Promise<void> {
    this.busy = true; this.confirmEl.replaceChildren(); this.pendingLabel = /^(goodbye|leave)/i.test(o.label) ? '' : splitPrice(o.label).text;
    for (const b of this.options.querySelectorAll('button')) (b as HTMLButtonElement).disabled = true;
    try {
      const r = await this.deps.choose(o.id, o.label);
      if (r.result !== 'accepted') { this.pendingLabel = ''; this.deps.toast(this.deps.describe(r.result), 'bad'); if (this.current) this.renderAll(this.current); }
    } finally { this.busy = false; }
  }
}
