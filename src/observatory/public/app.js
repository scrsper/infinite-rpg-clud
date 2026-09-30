const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="observatory-token"]').content;
let state, catalogue, selected, person, eventOffset = 0, mapHits = [], configLoaded = false, lastReport, lastHealth, refreshBusy = false, inspectedTick, inspectionRequest = 0;
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function button(text, action, cls) { const el = node('button', text, cls); el.type = 'button'; el.addEventListener('click', () => safe(action)); return el; }
function clear(el, children) { el.replaceChildren(...children); }
function details(title, content, open = false) { const el = node('details'); el.open = open; el.append(node('summary', title), content); return el; }
function pretty(key) { return key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').replace(/^./, x => x.toUpperCase()); }
function tree(value, depth = 0) {
  if (value === null || value === undefined) return node('span', 'Not represented', 'empty');
  if (typeof value !== 'object') return node('span', String(value));
  const el = node('div', undefined, depth ? 'tree' : '');
  const entries = Object.entries(value);
  if (!entries.length) return node('span', 'None recorded', 'empty');
  for (const [key, v] of entries.slice(0, 100)) {
    if (v && typeof v === 'object') { const label = Array.isArray(value) ? (v.name ?? v.description ?? v.type ?? v.key ?? v.id ?? `Record ${Number(key) + 1}`) : pretty(key); el.append(details(String(label), tree(v, depth + 1))); }
    else { const row = node('div', undefined, 'kv'); row.append(node('b', pretty(key)), node('span', v == null ? 'Not represented' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v))); el.append(row); }
  }
  if (entries.length > 100) el.append(node('p', `${entries.length - 100} further records omitted from this bounded view.`, 'muted'));
  return el;
}
async function api(path, body) {
  const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Observatory-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`); return data;
}
async function safe(fn) { try { $('notice').textContent = ''; await fn(); } catch (e) { $('notice').textContent = e.message; } }
async function post(path, body = {}) { await api('/api/' + path, body); await refresh(); }
function renderPeople() {
  const q = $('person-search').value.toLowerCase();
  clear($('people-list'), state.entities.filter(p => `${p.name} ${p.occupation}`.toLowerCase().includes(q)).map(p => {
    const el = button('', () => selectPerson(p.id), `person ${p.id === selected ? 'active' : ''} ${p.alive ? '' : 'dead'}`);
    el.append(node('strong', p.name), node('small', `${p.occupation} · ${p.alive ? p.goal : 'deceased'}`)); return el;
  }));
  $('population').textContent = state.entities.filter(p => p.alive).length + ' living';
}
function drawMap() {
  const canvas = $('map'), dpr = devicePixelRatio || 1, width = canvas.clientWidth, height = canvas.clientHeight;
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.fillStyle = '#101b20'; ctx.fillRect(0, 0, width, height);
  const bounds = state.places.map(p => p.bounds), x0 = Math.min(...bounds.map(b => b.x0)) - 8, x1 = Math.max(...bounds.map(b => b.x1)) + 8, z0 = Math.min(...bounds.map(b => b.z0)) - 8, z1 = Math.max(...bounds.map(b => b.z1)) + 8;
  const scale = Math.min((width - 20) / (x1 - x0), (height - 20) / (z1 - z0)), ox = (width - (x1 - x0) * scale) / 2, oz = (height - (z1 - z0) * scale) / 2;
  const point = (x, z) => [ox + (x - x0) * scale, oz + (z - z0) * scale];
  ctx.strokeStyle = '#1d2f39'; ctx.lineWidth = .5;
  for (let x = x0; x < x1; x += 10) { const [sx] = point(x, z0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke(); }
  for (const place of state.places) { const b = place.bounds, [x, y] = point(b.x0, b.z0); ctx.fillStyle = place.type === 'farm' ? '#2d3c2d' : place.type === 'well' ? '#255062' : '#253541'; ctx.strokeStyle = '#40535d'; ctx.fillRect(x, y, (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale); ctx.strokeRect(x, y, (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale); }
  mapHits = [];
  for (const p of state.entities) for (const b of p.bodies.filter(b => b.present)) {
    const [x, y] = point(b.pos.x, b.pos.z); mapHits.push({ x, y, id: p.id });
    ctx.beginPath(); ctx.arc(x, y, p.id === selected ? 5 : 3, 0, 2 * Math.PI); ctx.fillStyle = p.id === selected ? '#68d5c5' : p.alive ? '#b9cbd4' : '#6f4248'; ctx.fill();
    if (p.id === selected) { ctx.fillStyle = '#c4fff1'; ctx.font = '11px Segoe UI'; ctx.fillText(p.name, Math.min(width - 100, x + 9), y - 6); }
  }
  for (const a of state.animals) { const [x, y] = point(a.pos.x, a.pos.z); ctx.fillStyle = '#d7b575'; ctx.fillRect(x - 2, y - 2, 4, 4); }
  ctx.fillStyle = '#6d8795'; ctx.font = '10px Segoe UI'; ctx.fillText('N ↑', width - 30, 18); ctx.fillText('10 m grid · developer truth', 9, height - 10);
}
$('map').addEventListener('click', ev => { const r = $('map').getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; const hit = [...mapHits].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; if (hit && Math.hypot(hit.x - x, hit.y - y) < 16) safe(() => selectPerson(hit.id)); });
window.addEventListener('resize', () => { if (state) drawMap(); });
function eventButton(e) { const el = button('', () => selectEvent(e.id), 'event'); el.append(node('small', `${e.time} · ${e.type} · ${e.id}`), node('span', e.summary)); return el; }
async function selectPerson(id, preserve = false) {
  const request = ++inspectionRequest, scroll = preserve ? $('person-inspector').scrollTop : 0;
  const next = await api(`/api/person?id=${encodeURIComponent(id)}`); if (request !== inspectionRequest) return; if (!next) throw new Error('Person is not present');
  inspectedTick = state.tick;
  selected = id; person = next; $('selection-hint').hidden = true; $('selected-name').textContent = person.name; $('selected-occupation').textContent = person.truth.overview.occupation; $('ask-target').textContent = '— ' + person.name;
  const open = preserve ? [...$('person-inspector').querySelectorAll(':scope>details[open]')].map(d => d.firstChild.textContent) : ['Overview', 'Mind'];
  const contents = [node('div', 'CANONICAL TRUTH', 'truth-label')];
  for (const [key, value] of Object.entries(person.truth)) {
    const content = tree(value);
    if (key === 'mind') {
      const goal = person.truth.mind.goal;
      if (goal) { const why = node('div'); why.append(node('p', `Current goal: ${goal.type} · utility ${goal.utility.toFixed(3)}`), node('p', goal.reasons.join(' · '), 'muted')); if (goal.causeEvent) why.append(button('Open stored goal cause', () => selectEvent(goal.causeEvent), 'link')); else why.append(node('p', 'CAUSE UNKNOWN / NOT REPRESENTED: no stored goal cause event. Reasons above are the recorded utility inputs.', 'muted')); content.prepend(why); }
      if (person.truth.mind.adoptionEvent) content.prepend(button('Explore the recorded goal adoption', () => selectEvent(person.truth.mind.adoptionEvent.id), 'link'));
    }
    contents.push(details(pretty(key), content, open.includes(pretty(key))));
  }
  contents.push(node('div', 'WHAT THIS PERSON BELIEVES', 'belief-label'), node('p', person.beliefLimits, 'muted'));
  const knowledge = node('div');
  for (const k of person.beliefs) {
    const el = node('div', undefined, 'belief'); el.append(node('p', k.description), node('small', `${Math.round(k.confidence * 100)}% confidence · ${k.source.type} · ${k.hops} hops · ${k.learnedTime}`));
    const refs = node('div'); if (k.source.viaEvent) refs.append(button('Acquisition event', () => selectEvent(k.source.viaEvent), 'link')); if (k.claim.eventId) refs.append(button('Claimed event (developer truth)', () => selectEvent(k.claim.eventId), 'link'));
    el.append(refs, details(k.key + ' · provenance / revisions', tree(k))); knowledge.append(el);
  }
  contents.push(details(`Knowledge (${person.beliefs.length})`, knowledge, !preserve || open.includes(`Knowledge (${person.beliefs.length})`)), details('Memories', tree(person.memories), open.includes('Memories')));
  const history = node('div'); person.history.forEach(e => history.append(eventButton(e))); contents.push(details('History', history, open.includes('History')));
  clear($('person-inspector'), contents);
  $('person-inspector').scrollTop = scroll;
  const oldSpeaker = $('speaker').value;
  clear($('speaker'), person.nearbySpeakers.length ? person.nearbySpeakers.map(p => { const o = node('option', p.name); o.value = p.id; return o; }) : [node('option', 'No awake person within speaking reach')]);
  if (person.nearbySpeakers.some(p => p.id === oldSpeaker)) $('speaker').value = oldSpeaker;
  $('ask').disabled = !person.nearbySpeakers.length; renderPeople(); drawMap();
  if (!preserve) showContext();
}
function showContext() { clear($('language-debug'), [details('Bounded NPC context preview', tree(person.language.context)), details('Knowledge excluded from context', tree(person.language.excluded)), node('p', person.language.policy, 'muted')]); }
async function selectEvent(id) {
  const result = await api(`/api/event?id=${encodeURIComponent(id)}`);
  if (!result) { clear($('cause-detail'), [node('p', 'CAUSE UNKNOWN / NOT REPRESENTED: event was not retained.', 'amber')]); return; }
  const box = $('cause-detail'), e = result.event, children = [node('h3', e.summary), node('p', `${e.id} · tick ${e.tick.toFixed(1)} · ${e.type}`, 'muted')];
  const involved = node('div'); result.involved.forEach(p => involved.append(p.kind === 'person' ? button(p.name, () => selectPerson(p.id), 'link') : node('span', p.name, 'tag'))); children.push(involved);
  const first = result.involved.find(p => p.kind === 'person'); if (first) await selectPerson(first.id, true);
  children.push(details('CANONICAL TRUTH · event data', tree(e)), details(`Actually perceived by (${result.perceivedBy.length})`, tree(result.perceivedBy), true), details('People holding related beliefs', tree(result.beliefs)));
  result.graph.unknown.forEach(t => children.push(node('p', t, 'amber')));
  const graph = node('div'); result.graph.nodes.forEach(n => graph.append(button(`${n.id}: ${n.label}`, () => selectEvent(n.id), 'cause-node')));
  for (const edge of result.graph.edges) graph.append(node('div', `${edge.from} → ${edge.to} · ${edge.label}`, 'cause-edge'));
  if (result.graph.truncated) graph.append(node('p', 'Graph capped at 100 nodes. Select a node to explore its neighborhood.', 'muted'));
  children.push(graph); clear(box, children);
}
async function renderEvents() {
  const result = await api(`/api/events?group=${encodeURIComponent($('event-filter').value)}&q=${encodeURIComponent($('event-search').value)}&offset=${eventOffset}`);
  $('event-count').textContent = `${result.total.toLocaleString()} matching · retained log`; clear($('event-list'), result.events.map(eventButton));
}
async function metricDetail(key) {
  const metric = await api(`/api/metric?id=${encodeURIComponent(key)}`), box = node('div', undefined, 'evidence-list');
  for (const item of metric.evidence) box.append(button(`${item.label}${item.value === undefined ? '' : ' · ' + item.value}`, async () => {
    if (item.kind === 'person') return selectPerson(item.id);
    if (item.kind === 'event') return selectEvent(item.id);
    const entity = await api(`/api/entity?id=${encodeURIComponent(item.id)}`); clear($('cause-detail'), [node('h3', 'CANONICAL TRUTH · ' + item.label), tree(entity)]);
  }, 'event'));
  clear($('metric-detail'), [node('h3', metric.label), node('p', metric.scope, 'muted'), box]);
}
function renderMetrics() { clear($('metrics'), state.metrics.map(m => { const b = button('', () => metricDetail(m.key), 'metric'); b.append(node('span', m.label), node('strong', Number.isInteger(m.value) ? m.value.toLocaleString() : m.value.toFixed(1)), node('span', m.unit)); return b; })); }
function renderHealth() {
  if (lastHealth === state.health.tick && $('health-checks').childElementCount) return;
  lastHealth = state.health.tick;
  clear($('health-checks'), state.health.checks.map(c => { const el = node('div', undefined, 'check'); el.append(node('span', c.status, `status ${c.status === 'PASS' ? 'green' : c.status === 'FAIL' ? 'red' : 'amber'}`), node('strong', c.label), node('small', c.detail)); if (c.evidence?.length) el.append(details('Evidence', tree(c.evidence))); return el; }));
}
function renderReport() {
  if (!state.report || JSON.stringify(state.report) === lastReport) return; lastReport = JSON.stringify(state.report);
  const r = state.report, table = node('table', undefined, 'report-table'), head = node('tr'); ['Measured state', 'Before', 'After', 'Change'].forEach(t => head.append(node('th', t))); table.append(head);
  for (const metric of r.metrics) { const row = node('tr'); [metric.label, metric.before, metric.after, metric.delta].forEach(v => row.append(node('td', String(v)))); table.append(row); }
  clear($('report'), [node('h3', `${r.completed ? 'Completed' : 'Stopped / partial'} · ${r.mode} · ${((r.to - r.from) / 86400).toFixed(3)} world days · ${(r.elapsedMs / 1000).toFixed(1)} s wall time`), node('p', r.caveat, 'muted'), table, details('Resource quantities and canonical lifetime tallies', tree(r.resources)), details('Relationship changes', tree(r.relationships)), details('Events with large stored causal impact', tree(r.importantCauses)), details('Health failures observed during this run', tree(r.healthObservations?.filter(h => h.failures.length) ?? []))]);
}
async function refresh() {
  if (refreshBusy) return; refreshBusy = true;
  try {
    const beforeRevision = state?.revision; state = await api('/api/state');
    $('world-time').textContent = state.time; $('pause').textContent = state.paused ? 'Resume' : 'Pause'; $('speed').value = String(state.speed); $('health-light').textContent = state.health.status; $('health-light').className = 'pill ' + state.health.status.toLowerCase(); $('clock-info').textContent = state.clock;
    $('restore').disabled = !state.checkpoint;
    $('job-label').textContent = state.job?.error ? `${state.job.mode}: ${state.job.error}` : state.job?.active ? `${state.job.mode} · ${Math.min(100, (state.tick - state.job.from) / (state.job.to - state.job.from) * 100).toFixed(1)}% · ${(state.job.elapsedMs / 1000).toFixed(1)} s` : state.paused ? 'Paused · no wall-time catch-up' : `${state.speed}× · backlog ${state.debtSeconds.toFixed(1)} s`;
    if (!configLoaded) { const c = state.language.config; $('ai-enabled').checked = c.enabled; $('base-url').value = c.baseUrl; $('model').value = c.model; $('timeout').value = c.timeoutMs; $('tokens').value = c.maxTokens; configLoaded = true; }
    if (beforeRevision !== undefined && beforeRevision !== state.revision) { selected = null; person = null; inspectionRequest++; clear($('person-inspector'), []); clear($('cause-detail'), []); clear($('metric-detail'), []); clear($('report'), []); clear($('language-debug'), []); clear($('speaker'), [node('option', 'Select an NPC first')]); $('ask').disabled = true; $('ask-target').textContent = '— select a person'; $('speech').textContent = ''; $('selected-name').textContent = 'Select a person'; $('selection-hint').hidden = false; lastReport = null; lastHealth = null; }
    if (!selected) $('selected-occupation').textContent = '';
    renderPeople(); drawMap(); renderMetrics(); renderHealth(); renderReport(); await renderEvents();
    if (selected && inspectedTick !== state.tick) await selectPerson(selected, true);
  } finally { refreshBusy = false; }
}
$('person-search').addEventListener('input', renderPeople);
$('event-filter').addEventListener('change', () => safe(async () => { eventOffset = 0; await renderEvents(); }));
let searchTimer; $('event-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => safe(async () => { eventOffset = 0; await renderEvents(); }), 250); });
$('older').onclick = () => safe(async () => { eventOffset += 80; await renderEvents(); });
$('newest').onclick = () => safe(async () => { eventOffset = 0; await renderEvents(); });
$('pause').onclick = () => safe(() => post('control', { paused: !state.paused, speed: Number($('speed').value) }));
$('speed').onchange = () => safe(() => post('control', { paused: state.paused, speed: Number($('speed').value) }));
document.querySelectorAll('[data-advance],[data-run]').forEach(b => b.onclick = () => safe(() => post('advance', { seconds: Number(b.dataset.advance ?? b.dataset.run), noPlayer: !!b.dataset.run })));
$('cancel').onclick = () => safe(() => post('cancel'));
$('scenario').onchange = () => { $('scenario-description').textContent = catalogue.scenarios.find(s => s.id === $('scenario').value).description; };
$('reset').onclick = () => safe(() => post('reset', { scenario: $('scenario').value, seed: Number($('seed').value) }));
$('checkpoint').onclick = () => safe(() => post('checkpoint'));
$('restore').onclick = () => safe(() => post('restore'));
$('verify').onclick = () => safe(async () => { $('verify').disabled = true; try { await api('/api/verify', {}); lastHealth = null; await refresh(); } finally { $('verify').disabled = false; } });
$('config-form').onsubmit = ev => { ev.preventDefault(); safe(async () => { await post('config', { enabled: $('ai-enabled').checked, baseUrl: $('base-url').value, model: $('model').value, timeoutMs: Number($('timeout').value), maxTokens: Number($('tokens').value), temperature: .2, concurrency: 1 }); $('model-status').textContent = 'Configuration applied. Disabled/offline models use deterministic fallback.'; }); };
$('thought').onclick = () => safe(async () => {
  if (!selected) throw new Error('Select a living person first.');
  $('thought').disabled = true;
  try { const r = await api('/api/thought', { npcId: selected }); $('speech').textContent = r.generated.output.speech;
    clear($('language-debug'), [node('h3', r.mode), node('p', r.note, 'muted'), details('Exact context / allowed expression', node('pre', JSON.stringify(r.modelInput, null, 2))), details('Model response / validation / timing', node('pre', JSON.stringify(r.generated, null, 2)))]);
  } finally { $('thought').disabled = false; }
});
$('probe').onclick = () => safe(async () => { const r = await api('/api/probe'); $('model-status').textContent = r.online ? `${r.models.length} model IDs available. Configured model ${r.configuredModelInstalled ? 'found' : 'not found; select a listed model'}.` : 'Local endpoint unavailable. Start Ollama, or start LM Studio’s local server on port 1234, then apply its URL. Gameplay uses fallback.'; clear($('models'), r.models.map(id => { const o = node('option'); o.value = id; return o; })); });
$('ask-form').onsubmit = ev => { ev.preventDefault(); safe(async () => {
  if (!selected || !person.nearbySpeakers.length) throw new Error('Select an NPC with an awake speaker nearby.');
  $('ask').disabled = true; $('speech').textContent = 'Interpreting your words…';
  try {
    const r = await api('/api/ask', { npcId: selected, speakerId: $('speaker').value, text: $('player-text').value });
    $('speech').textContent = r.generated.output.speech;
    const pipeline = node('div'); pipeline.append(node('h3', `${r.parsed.output.intent} → ${r.canonical.reason} → ${r.generated.fallback ? 'DETERMINISTIC FALLBACK' : 'VALIDATED LOCAL MODEL'}`), node('p', `${(r.elapsedMs / 1000).toFixed(2)} s total · knowledge transferred only through canonical conversation`, 'muted'));
    clear($('language-debug'), [pipeline, details('Player text and parsed intent', tree({ text: r.playerText, request: r.parseInput, ...r.parsed })), details('Canonical conversation result', tree(r.canonical), true), details('Exact context sent to the response model', node('pre', JSON.stringify(r.modelInput, null, 2))), details('Knowledge excluded', tree(r.excluded)), details('Raw model responses / validation / fallback / latency / tokens', node('pre', JSON.stringify(r.generated, null, 2))), node('p', r.note, 'muted')]);
    await refresh(); await selectPerson(selected, true);
  } finally { $('ask').disabled = !person?.nearbySpeakers.length; }
}); };
await safe(async () => { catalogue = await api('/api/catalogue'); catalogue.scenarios.forEach(s => { const o = node('option', s.title); o.value = s.id; $('scenario').append(o); }); catalogue.filters.forEach(f => { const o = node('option', pretty(f)); o.value = f; $('event-filter').append(o); }); $('scenario').onchange(); await refresh(); });
setInterval(() => safe(refresh), 2000);
