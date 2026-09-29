import { App } from './app';

/** Boot the browser client. Everything else lives in App; this stays tiny so the bundle entry is obvious. */
App.start().catch(e => {
  console.error('[tv] fatal', e);
  const ui = document.getElementById('ui');
  if (ui) ui.textContent = `Torn Veil could not start: ${String(e && (e as Error).message || e)}`;
});
