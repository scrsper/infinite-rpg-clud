/** Tiny DOM builder. Text is always set through textContent, never as HTML: every string in the UI can come from the world. */
type Child = Node | string | number | null | undefined | false;
export interface Props {
  class?: string; id?: string; text?: string; title?: string; type?: string; value?: string | number; placeholder?: string; disabled?: boolean; tabindex?: number; role?: string;
  style?: Partial<CSSStyleDeclaration> | string; min?: number | string; max?: number | string; step?: number | string; checked?: boolean; maxLength?: number;
  aria?: Record<string, string | number | boolean>; data?: Record<string, string | number | boolean>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  [k: string]: unknown;
}
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      switch (k) {
        case 'class': el.className = String(v); break;
        case 'text': el.textContent = String(v); break;
        case 'style': if (typeof v === 'string') el.setAttribute('style', v); else Object.assign(el.style, v); break;
        case 'aria': for (const [a, val] of Object.entries(v as Record<string, unknown>)) el.setAttribute(`aria-${a}`, String(val)); break;
        case 'data': for (const [a, val] of Object.entries(v as Record<string, unknown>)) el.setAttribute(`data-${a}`, String(val)); break;
        case 'on': for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) el.addEventListener(ev, fn); break;
        case 'disabled': (el as HTMLButtonElement).disabled = !!v; break;
        case 'checked': (el as HTMLInputElement).checked = !!v; break;
        case 'value': (el as HTMLInputElement).value = String(v); break;
        default: el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) { if (c === null || c === undefined || c === false) continue; el.append(typeof c === 'number' ? String(c) : c); }
  return el;
}
export function clear(el: Element): void { while (el.firstChild) el.removeChild(el.firstChild); }
export const key = (label: string): HTMLElement => h('span', { class: 'tv-key', text: label });
/** Append children, skipping null/false so conditional pieces read naturally. */
export function add<T extends Element>(el: T, ...children: Child[]): T {
  for (const c of children) { if (c === null || c === undefined || c === false) continue; el.append(typeof c === 'number' ? String(c) : c); }
  return el;
}
