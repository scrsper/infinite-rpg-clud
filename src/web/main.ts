import { App } from './app';

/** Boot the browser client. Everything else lives in App; this stays tiny so the bundle entry is obvious. */
const start = new URLSearchParams(location.search).has('arena') ? import('./arena/arena').then(m => m.startArena()) : App.start();
start.catch(e => {
  console.error('[tv] fatal', e);
  const ui = document.getElementById('ui');
  if (ui) ui.textContent = `Torn Veil could not start: ${String(e && (e as Error).message || e)}`;
});
