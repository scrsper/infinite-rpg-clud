const main = document.querySelector('main');
const key = 'torn-veil.observatory.layout.v1';
const panels = [...main.querySelectorAll('.panel')];
const original = [...panels];
const names = ['people', 'map', 'settlement', 'events', 'person', 'causes', 'scenarios', 'health', 'validation', 'dialogue'];
let selected = null, frame = null, dragging = null;
const viewport = document.createElement('section');
viewport.className = 'panel viewport-panel'; viewport.dataset.panel = 'viewport';
viewport.innerHTML = `<div class="panel-title"><h2>Game viewport</h2><span>Same isolated world · Babylon.js</span></div>
<div class="viewport-toolbar"><button id="viewport-open">Play selected person</button><button id="viewport-close" disabled>Release character / close</button><span id="viewport-status" role="status">Select a living person, then open the viewport.</span></div>
<p class="muted">Playing takes control of that person. Resume at 1× to move; Escape releases the pointer. Pause or advance time using the toolbar above. Gameplay uses 60 Hz interaction scheduling until this world is reset; headless validation results are separate. Saves are in-memory checkpoints for this server session.</p><div id="viewport-host"></div>`;
panels.forEach((panel, i) => { panel.dataset.panel = names[i] ?? `panel-${i}`; });
panels.splice(2, 0, viewport);
original.splice(0, original.length, panels.find(p => p.dataset.panel === 'people'), viewport, panels.find(p => p.dataset.panel === 'person'), ...panels.filter(p => !['people','person','viewport'].includes(p.dataset.panel)));
main.replaceChildren(...panels); main.classList.add('workbench');
const status = document.getElementById('viewport-status');
const openButton = document.getElementById('viewport-open');
openButton.disabled = true;
fetch('/health').then(r => r.json()).then(health => {
  openButton.disabled = health.diagnosticVersion < 3;
  if (openButton.disabled) status.textContent = 'This preserved server predates the workbench. Launch Torn Veil Observatory.cmd to open a new version without disturbing this world.';
}).catch(() => { status.textContent = 'Cannot reach the Observatory server.'; });
function persist() {
  try { localStorage.setItem(key, JSON.stringify([...main.children].map(p => ({ id: p.dataset.panel, span: p.dataset.span, collapsed: p.classList.contains('panel-collapsed'), height: p.style.height })))); } catch { /* Storage may be unavailable. Layout still works. */ }
}
function applyDefaults() {
  main.replaceChildren(...original);
  for (const panel of panels) {
    panel.dataset.span = panel === viewport ? '6' : ['people','person'].includes(panel.dataset.panel) ? '3' : '4';
    panel.classList.remove('panel-collapsed'); panel.style.height = '';
    panel.querySelector('.panel-width').value = panel.dataset.span;
    panel.querySelector('.panel-collapse').setAttribute('aria-expanded', 'true');
  }
  persist();
}
for (const panel of panels) {
  const title = panel.querySelector('.panel-title');
  const controls = document.createElement('div'); controls.className = 'panel-tools';
  const handle = document.createElement('button'); handle.textContent = '⠿'; handle.className = 'panel-drag'; handle.draggable = true;
  handle.title = 'Drag to rearrange panel'; handle.setAttribute('aria-label', `Move ${title.querySelector('h2').textContent} panel`);
  handle.addEventListener('dragstart', e => { dragging = panel; e.dataTransfer.setData('text/plain', panel.dataset.panel); e.dataTransfer.effectAllowed = 'move'; main.classList.add('dragging'); });
  handle.addEventListener('dragend', () => { dragging = null; main.classList.remove('dragging'); document.querySelectorAll('.drop-target').forEach(p => p.classList.remove('drop-target')); });
  panel.addEventListener('dragover', e => { if (dragging && dragging !== panel) { e.preventDefault(); panel.classList.add('drop-target'); } });
  panel.addEventListener('dragleave', () => panel.classList.remove('drop-target'));
  panel.addEventListener('drop', e => { e.preventDefault(); panel.classList.remove('drop-target'); if (dragging && dragging !== panel) { main.insertBefore(dragging, panel); persist(); } });
  const earlier = document.createElement('button'); earlier.textContent = '←'; earlier.title = 'Move panel earlier';
  earlier.onclick = () => { if (panel.previousElementSibling) main.insertBefore(panel, panel.previousElementSibling); persist(); };
  const later = document.createElement('button'); later.textContent = '→'; later.title = 'Move panel later';
  later.onclick = () => { if (panel.nextElementSibling) main.insertBefore(panel.nextElementSibling, panel); persist(); };
  const width = document.createElement('select'); width.className = 'panel-width'; width.setAttribute('aria-label', 'Panel width');
  for (const [value, label] of [['3','¼'],['4','⅓'],['6','½'],['8','⅔'],['12','Full']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; width.append(option); }
  width.onchange = () => { panel.dataset.span = width.value; persist(); };
  const collapse = document.createElement('button'); collapse.className = 'panel-collapse'; collapse.textContent = '−'; collapse.title = 'Collapse or expand panel';
  collapse.onclick = () => { panel.classList.toggle('panel-collapsed'); collapse.setAttribute('aria-expanded', String(!panel.classList.contains('panel-collapsed'))); persist(); };
  controls.append(handle, earlier, later, width, collapse); title.append(controls);
  panel.addEventListener('pointerup', persist);
}
let saved;
try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* Ignore invalid local preferences. */ }
applyDefaults();
if (Array.isArray(saved)) {
  const seen = new Set();
  for (const item of saved) {
    const panel = panels.find(p => p.dataset.panel === item?.id); if (!panel || seen.has(panel)) continue;
    seen.add(panel); main.append(panel);
    if (['3','4','6','8','12'].includes(item.span)) { panel.dataset.span = item.span; panel.querySelector('.panel-width').value = item.span; }
    panel.classList.toggle('panel-collapsed', item.collapsed === true);
    panel.querySelector('.panel-collapse').setAttribute('aria-expanded', String(!item.collapsed));
    if (/^\d+(\.\d+)?px$/.test(item.height) && parseFloat(item.height) >= 150 && parseFloat(item.height) <= 3000) panel.style.height = item.height;
  }
  persist();
}
const reset = document.createElement('button'); reset.textContent = 'Reset panel layout'; reset.onclick = applyDefaults;
document.querySelector('nav').append(reset);
window.addEventListener('observatory-selection', e => { selected = e.detail.id; });
document.getElementById('viewport-open').onclick = () => {
  if (!selected) { status.textContent = 'Select a living person in People first.'; return; }
  if (frame) { status.textContent = 'Close the current viewport before choosing another person.'; return; }
  frame = document.createElement('iframe'); frame.title = 'Playable Babylon viewport of this Observatory world';
  frame.src = `/game/?observatory=1&autoplay=1&view=orbit&renderer=webgl2&quality=balanced&person=${encodeURIComponent(selected)}`;
  frame.allow = 'fullscreen'; document.getElementById('viewport-host').append(frame);
  status.textContent = 'Loading the existing world…'; document.getElementById('viewport-close').disabled = false;
};
document.getElementById('viewport-close').onclick = () => {
  if (!frame) return;
  frame.contentWindow.postMessage({ type: 'observatory-close' }, location.origin);
  const previous = frame; frame = null; setTimeout(() => previous.remove(), 250);
  status.textContent = 'Character released. The simulation remains available in the inspectors.';
  document.getElementById('viewport-close').disabled = true;
};
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== frame?.contentWindow) return;
  if (e.data?.type === 'observatory-viewport-status') status.textContent = e.data.busy ? 'Advancing the same world…' : e.data.playable ? 'Live · click the viewport to play' : 'Watching · Resume at 1× to play';
  if (e.data?.type === 'observatory-viewport-error') status.textContent = `${e.data.message} Close and reopen the viewport.`;
});
