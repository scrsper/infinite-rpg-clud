import { clear, h } from './dom';
import type { NavScope, UiNav } from './nav';

/**
 * One modal at a time over the game: a titled dialog with optional tabs and a footer. It owns
 * focus (via UiNav) and re-renders in place when the world changes underneath it, keeping the
 * focused control and scroll position so a menu that updates every few ticks never jumps.
 */
export interface TabDef { id: string; label: string; render(body: HTMLElement): void }
export interface ModalOptions {
  title: string; subtitle?: string; tabs?: TabDef[]; initialTab?: string; render?: (body: HTMLElement) => void;
  footer?: (footer: HTMLElement) => void; hints?: { key: string; text: string }[]; onClose?: () => void; width?: string; badge?: string;
}
export class ModalHost {
  private scope: NavScope | null = null;
  private scrim: HTMLElement | null = null;
  private body: HTMLElement | null = null;
  private opts: ModalOptions | null = null;
  private tab = '';
  constructor(private readonly layer: HTMLElement, private readonly nav: UiNav) {}
  get isOpen(): boolean { return this.scope !== null; }
  get currentTab(): string { return this.tab; }

  open(opts: ModalOptions): void {
    this.close(false);
    this.opts = opts; this.tab = opts.initialTab ?? opts.tabs?.[0]?.id ?? '';
    const tabsEl = opts.tabs ? h('div', { class: 'tv-tabs', role: 'tablist' }) : null;
    this.body = h('div', { class: 'body' });
    const footer = h('footer'); opts.footer?.(footer);
    if (opts.hints) footer.append(h('div', { class: 'tv-footer-hint' }, ...opts.hints.map(x => h('span', null, h('span', { class: 'tv-key', text: x.key }), ' ', x.text))));
    const dialog = h('div', { class: 'tv-dialog tv-panel', role: 'dialog', aria: { modal: true, label: opts.title }, ...(opts.width ? { style: `width:${opts.width}` } : {}) },
      h('header', null, h('h1', { class: 'tv-h1', text: opts.title }), opts.badge ? h('span', { class: 'tv-badge preview', text: opts.badge }) : null, opts.subtitle ? h('span', { class: 'tv-sub', text: opts.subtitle }) : null),
      tabsEl, this.body, footer);
    this.scrim = h('div', { class: 'tv-modal-scrim' }, dialog);
    this.scrim.addEventListener('mousedown', e => { if (e.target === this.scrim) this.close(); });
    this.layer.append(this.scrim);
    this.scope = { root: dialog, onBack: () => this.close(), onTab: dir => this.stepTab(dir) };
    this.nav.push(this.scope, false);
    this.renderTabs(); this.renderBody(true);
  }
  private renderTabs(): void {
    const el = this.scrim?.querySelector('.tv-tabs'); if (!el || !this.opts?.tabs) return;
    clear(el);
    for (const t of this.opts.tabs) el.append(h('button', { class: 'tv-tab', type: 'button', role: 'tab', aria: { selected: t.id === this.tab }, on: { click: () => this.setTab(t.id) } }, t.label));
  }
  setTab(id: string): void { this.tab = id; this.renderTabs(); this.renderBody(true); }
  private stepTab(dir: -1 | 1): void {
    const tabs = this.opts?.tabs; if (!tabs?.length) return;
    const i = tabs.findIndex(t => t.id === this.tab); this.setTab(tabs[(i + dir + tabs.length) % tabs.length].id);
  }
  /** Re-render the body (world changed) keeping focus and scroll. */
  refresh(): void { this.renderBody(false); }
  private renderBody(focusFirst: boolean): void {
    if (!this.body || !this.opts) return;
    const active = document.activeElement as HTMLElement | null, fk = active && this.body.contains(active) ? active.getAttribute('data-fk') : null, top = this.body.scrollTop;
    clear(this.body);
    if (this.opts.tabs) this.opts.tabs.find(t => t.id === this.tab)?.render(this.body); else this.opts.render?.(this.body);
    if (focusFirst) { queueMicrotask(() => { if (this.scope) this.nav.focusFirst(this.scope.root); }); }
    else { this.body.scrollTop = top; if (fk) (this.body.querySelector(`[data-fk="${CSS.escape(fk)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }); }
  }
  close(notify = true): void {
    if (!this.scope) return;
    this.nav.pop(this.scope); this.scope = null; this.scrim?.remove(); this.scrim = null; this.body = null;
    const cb = this.opts?.onClose; this.opts = null; if (notify) cb?.();
  }
}
