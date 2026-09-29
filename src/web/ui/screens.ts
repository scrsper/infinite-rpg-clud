import { clear, h } from './dom';

/**
 * Full-screen states around the game: the title/launcher, loading, character creation, death and
 * fatal connection notices. They are plain DOM over the canvas. None of them starts a world or
 * changes one: Play connects to the world the launcher already resolved; creating a character asks
 * the server, which decides whether that is allowed.
 */
export interface TitleOptions {
  session: 'checking' | 'ok' | 'none';
  serverNote: string;
  remembered: { name: string } | null;
  replay: boolean;
  onPlay(): void; onNewCharacter(): void; onSettings(): void; onControls(): void; onShowroom(): void; onAbout(): void;
  hint(text: string): void;
}
export function titleScreen(parent: HTMLElement, o: TitleOptions): { el: HTMLElement; setSession(s: TitleOptions['session'], note: string): void; remove(): void } {
  const note = h('div', { class: 'tv-fine', role: 'status' });
  const playLabel = o.remembered ? `Continue as ${o.remembered.name}` : 'Play';
  const play = h('button', { class: 'tv-btn primary', type: 'button', 'data-autofocus': '1', on: { click: () => o.onPlay() } }, playLabel);
  const create = h('button', { class: 'tv-btn', type: 'button', on: { click: () => o.onNewCharacter() } }, 'New character');
  const menu = h('div', { class: 'tv-menu', role: 'menu' }, play, create,
    h('button', { class: 'tv-btn', type: 'button', on: { click: () => o.onShowroom() } }, 'Art showroom'),
    h('button', { class: 'tv-btn', type: 'button', on: { click: () => o.onControls() } }, 'Controls'),
    h('button', { class: 'tv-btn', type: 'button', on: { click: () => o.onSettings() } }, 'Settings'),
    h('button', { class: 'tv-btn', type: 'button', on: { click: () => o.onAbout() } }, 'About this build'));
  const el = h('div', { class: 'tv-title-screen' }, h('div', { class: 'tv-title-col' },
    h('div', { class: 'tv-logo' }, 'Torn Veil', h('small', { text: 'Online' })), menu, note,
    h('div', { class: 'tv-fine', text: 'The world keeps living whether or not you watch it. Actions here are the same actions the people of this world take.' })));
  parent.append(el);
  const set = (s: TitleOptions['session'], text: string) => {
    play.disabled = create.disabled = s !== 'ok' && !o.replay; note.textContent = text; note.className = `tv-fine${s === 'none' ? ' tv-bad' : ''}`;
  };
  set(o.session, o.serverNote);
  return { el, setSession: set, remove: () => el.remove() };
}

export function loadingScreen(parent: HTMLElement, text: string): { el: HTMLElement; set(text: string): void; remove(): void } {
  const label = h('div', { class: 'tv-h2', text });
  const el = h('div', { class: 'tv-loading' }, h('div', { class: 'tv-logo', style: 'font-size:2rem' }, 'Torn Veil'), label, h('div', { class: 'bar' }, h('i')));
  parent.append(el); return { el, set: t => { label.textContent = t; }, remove: () => el.remove() };
}

export function characterScreen(parent: HTMLElement, opts: { error?: string; maxNote?: string; onCreate(name: string, sex: 'f' | 'm'): void; onBack(): void }): { el: HTMLElement; remove(): void } {
  const name = h('input', { class: 'tv-input', type: 'text', maxLength: 32, placeholder: 'Given name and family name', 'data-autofocus': '1', aria: { label: 'Character name' } });
  let sex: 'f' | 'm' = 'f';
  const btnF = h('button', { class: 'tv-btn primary', type: 'button', 'aria-pressed': 'true' }, 'Woman'), btnM = h('button', { class: 'tv-btn', type: 'button', 'aria-pressed': 'false' }, 'Man');
  const setSex = (s: 'f' | 'm') => { sex = s; btnF.classList.toggle('primary', s === 'f'); btnM.classList.toggle('primary', s === 'm'); btnF.setAttribute('aria-pressed', String(s === 'f')); btnM.setAttribute('aria-pressed', String(s === 'm')); };
  btnF.addEventListener('click', () => setSex('f')); btnM.addEventListener('click', () => setSex('m'));
  const err = h('div', { class: 'tv-bad', role: 'alert', text: opts.error ?? '' });
  const create = h('button', { class: 'tv-btn primary', type: 'button', on: { click: () => { const n = name.value.trim().replace(/\s+/g, ' '); if (!/^[A-Za-z][A-Za-z '\-]{2,31}$/.test(n)) { err.textContent = 'Use 3–32 letters, spaces, apostrophes or hyphens.'; return; } opts.onCreate(n, sex); } } }, 'Begin');
  name.addEventListener('keydown', e => { if (e.key === 'Enter') create.click(); });
  const el = h('div', { class: 'tv-modal-scrim' }, h('div', { class: 'tv-dialog tv-panel', style: 'width:min(34rem,94vw)' },
    h('header', null, h('h1', { class: 'tv-h1', text: 'A new life' })),
    h('div', { class: 'body' },
      h('p', { class: 'tv-sub', text: 'Choose a name. The world decides who you were born as: your face, build and clothing come from the people of the settlement you arrive in. Death is permanent.' }),
      h('div', { class: 'tv-grid' }, h('label', { text: 'Name' }), name, h('label', { text: 'Presentation' }), h('div', { style: 'display:flex;gap:.6rem' }, btnF, btnM), err, opts.maxNote ? h('div', { class: 'tv-sub', text: opts.maxNote }) : null)),
    h('footer', null, create, h('button', { class: 'tv-btn', type: 'button', on: { click: () => opts.onBack() } }, 'Back'))));
  parent.append(el); return { el, remove: () => el.remove() };
}

export function deathScreen(parent: HTMLElement, name: string, opts: { onNew(): void; onQuit(): void }): { el: HTMLElement; remove(): void } {
  const el = h('div', { class: 'tv-death' }, h('h1', { text: 'You have died' }), h('p', { class: 'tv-sub', text: `${name} is gone. Death here is permanent, and the world will go on without you.` }),
    h('div', { style: 'display:flex;gap:.7rem' }, h('button', { class: 'tv-btn primary', type: 'button', 'data-autofocus': '1', on: { click: () => opts.onNew() } }, 'Begin a new life'), h('button', { class: 'tv-btn', type: 'button', on: { click: () => opts.onQuit() } }, 'Return to title')));
  parent.append(el); return { el, remove: () => el.remove() };
}

export function noticeScreen(parent: HTMLElement, title: string, text: string, actions: { label: string; primary?: boolean; run(): void }[]): { el: HTMLElement; remove(): void } {
  const el = h('div', { class: 'tv-modal-scrim' }, h('div', { class: 'tv-dialog tv-panel', style: 'width:min(36rem,94vw)', role: 'alertdialog', aria: { label: title } },
    h('header', null, h('h1', { class: 'tv-h1', text: title })), h('div', { class: 'body' }, h('p', { text })),
    h('footer', null, ...actions.map((a, i) => h('button', { class: `tv-btn${a.primary ? ' primary' : ''}`, type: 'button', ...(i === 0 ? { 'data-autofocus': '1' } : {}), on: { click: () => a.run() } }, a.label)))));
  parent.append(el); return { el, remove: () => el.remove() };
}

export function banner(parent: HTMLElement, text: string, kind: 'bad' | 'info' = 'bad'): { el: HTMLElement; set(text: string): void; remove(): void } {
  const el = h('div', { class: `tv-banner ${kind}`, role: 'alert', text }); parent.append(el);
  return { el, set: t => { el.textContent = t; }, remove: () => el.remove() };
}
export { clear };
