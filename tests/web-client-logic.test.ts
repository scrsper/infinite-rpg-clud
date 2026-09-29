import { describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_KEYBOARD, DEFAULT_PAD, DEFAULT_SETTINGS, bindingsFor, codeLabel, sanitizeSettings } from '../src/web/game/bindings';
import { clockText, daypart, describeResult, pct, titleCase } from '../src/web/game/text';
import { classify, splitPrice, needsConfirm } from '../src/web/ui/dialoguePanel';

/**
 * Pure client logic that a player's experience rests on: what the bindings say, how stored settings are
 * trusted, how a canonical result code is worded, and how a dialogue menu is grouped. No DOM, no renderer.
 */
/** Movement is analog on the left stick and has no button binding; crouch is keyboard/Abilities-menu only. */
const STICK_OR_KEY_ONLY = new Set(['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'crouch']);

describe('bindings', () => {
  it('every rebindable action has a keyboard binding, and every action a pad binding or a reason not to', () => {
    for (const a of ACTIONS) {
      expect(DEFAULT_KEYBOARD[a.id]?.length, `keyboard ${a.id}`).toBeGreaterThan(0);
      if (!STICK_OR_KEY_ONLY.has(a.id)) expect(DEFAULT_PAD[a.id]?.length, `pad ${a.id}`).toBeGreaterThan(0);
    }
  });
  it('pause cannot be rebound, so Escape always gets a player out of a menu', () => {
    expect(ACTIONS.find(a => a.id === 'pause')?.rebindable).toBe(false);
    expect(bindingsFor(DEFAULT_SETTINGS, 'keyboard', 'pause')).toContain('Escape');
  });
  it('no two gameplay actions share a default key', () => {
    const owners = new Map<string, string[]>();
    for (const a of ACTIONS.filter(x => x.group !== 'Menus' || x.id !== 'pause')) for (const c of DEFAULT_KEYBOARD[a.id] ?? []) owners.set(c, [...(owners.get(c) ?? []), a.id]);
    const clashes = [...owners].filter(([, v]) => v.length > 1);
    expect(clashes, JSON.stringify(clashes)).toEqual([]);
  });
  it('prompts use names a player recognises, per controller family', () => {
    expect(codeLabel('KeyE', 'keyboard')).toBe('E');
    expect(codeLabel('Mouse0', 'keyboard')).toBe('Left click');
    expect(codeLabel('Pad0', 'xbox')).toBe('A');
    expect(codeLabel('Pad0', 'playstation')).toBe('Cross');
    expect(codeLabel('Pad9', 'xbox')).toBe('Menu');
    expect(codeLabel('Pad9', 'playstation')).toBe('Options');
  });
});

describe('stored settings are not trusted', () => {
  it('garbage falls back to defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);
  });
  it('numbers are clamped, non-numbers ignored, and enums validated', () => {
    const s = sanitizeSettings({ uiScale: 99, fov: -5, masterVolume: 'loud', cameraShake: Number.NaN, quality: 'ultra', textSize: 'large', colorAssist: 'deuteranopia', reducedMotion: 'yes', showHints: false });
    expect(s.uiScale).toBe(1.4); expect(s.fov).toBe(40); expect(s.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume); expect(s.cameraShake).toBe(DEFAULT_SETTINGS.cameraShake);
    expect(s.quality).toBe('auto'); expect(s.textSize).toBe('large'); expect(s.colorAssist).toBe('deuteranopia');
    expect(s.reducedMotion).toBe(false); expect(s.showHints).toBe(false);
  });
  it('rebinding keeps valid codes, drops invalid ones, refuses non-rebindable actions, and never leaves prototype junk', () => {
    const s = sanitizeSettings({ keyboard: { interact: ['KeyF', 'not-a-key', 42], pause: ['KeyP'], guard: ['garbage'], hush: [], __proto__: { evil: ['KeyX'] } }, pad: { lightAttack: ['Pad3'] } });
    expect(s.keyboard.interact).toEqual(['KeyF']);
    expect(s.keyboard.pause).toBeUndefined();
    expect(s.keyboard.guard).toBeUndefined();          // all-invalid list keeps the default
    expect(s.keyboard.hush).toEqual([]);               // an explicit empty list is a deliberate unbind
    expect((s.keyboard as Record<string, unknown>).evil).toBeUndefined();
    expect(s.pad.lightAttack).toEqual(['Pad3']);
    expect(bindingsFor(s, 'keyboard', 'guard')).toEqual(DEFAULT_KEYBOARD.guard);
  });
});

describe('player-facing wording', () => {
  it('canonical result codes read as sentences, and unknown codes are humanised, not hidden', () => {
    expect(describeResult('talk_too_far').text).toBe('Step closer to talk.');
    expect(describeResult('accepted').tone).toBe('info');
    expect(describeResult('some_new_refusal_code').text).toBe('Some new refusal code.');
    expect(describeResult('').text).toBe('Done.');
  });
  it('time and formatting helpers', () => {
    expect(clockText(0).text).toBe('Day 1, 00:00');
    expect(clockText(86400 + 13.5 * 3600).text).toBe('Day 2, 13:30');
    expect(daypart(12)).toBe('Midday'); expect(daypart(2)).toBe('Deep night');
    expect(pct(0.456)).toBe('46%'); expect(pct(3)).toBe('100%'); expect(pct(-1)).toBe('0%');
    expect(titleCase('iron_breakthrough')).toBe('Iron Breakthrough');
  });
});

describe('dialogue menu grouping', () => {
  it('anything that spends silver or commits the player asks first, in every wording the server uses', () => {
    for (const l of ['Buy bread (4s each, 9 to be had)', 'Buy iron key (5s, 2 to be had)', 'Buy a meal — stew (3s)', 'Sell bread (2s)', 'Carry 3 flour from the mill to the bakery (4s)', 'Deal with the boar near the mill (10s)', 'Teach me the hush — how you still a frightened beast (6s)']) expect(needsConfirm(l), l).toBe(true);
    for (const l of ['Goodbye', "What's the news?", 'Trade', 'More goods…', 'Ask about someone…']) expect(needsConfirm(l), l).toBe(false);
  });
  it('sorts the server\'s own option labels into a few intentions', () => {
    expect(classify('Goodbye.')).toBe('leave');
    expect(classify('Trade')).toBe('trade');
    expect(classify('Buy a meal — stew (3s)')).toBe('trade');
    expect(classify('Any work going?')).toBe('work');
    expect(classify('Carry the flour to the mill (4s)')).toBe('work');
    expect(classify('Spar with me')).toBe('teach');
    expect(classify('Tell them something you know')).toBe('favour');
    expect(classify("What's the news?")).toBe('talk');
    expect(classify('Something unforeseen')).toBe('more');
  });
  it('splits a price out of a label without altering the words', () => {
    expect(splitPrice('Buy a meal — stew (3s)')).toEqual({ text: 'Buy a meal — stew', price: '3 silver', note: null });
    expect(splitPrice('Sell bread (2s)')).toEqual({ text: 'Sell bread', price: '+2 silver', note: null });
    expect(splitPrice('Goodbye')).toEqual({ text: 'Goodbye', price: null, note: null });
    // The exact wording the dialogue system uses for a stack and for a single item with stock.
    expect(splitPrice('Buy bread (4s each, 9 to be had)')).toEqual({ text: 'Buy bread', price: '4 silver each', note: '9 to be had' });
    expect(splitPrice('Buy iron key (5s, 2 to be had)')).toEqual({ text: 'Buy iron key', price: '5 silver', note: '2 to be had' });
    expect(splitPrice('Carry 3 flour from the mill to the bakery (4s)').price).toBe('4 silver');
  });
});

describe('what an offer costs the player', () => {
  it('reads the price a row asks, and nothing for a sale or a free row', async () => {
    const { costOf } = await import('../src/web/ui/dialoguePanel');
    expect(costOf('Buy bread (4s each, 9 to be had)')).toBe(4);
    expect(costOf('Buy a meal — stew (3s)')).toBe(3);
    expect(costOf('Teach me the hush — how you still a frightened beast (6s)')).toBe(6);
    expect(costOf('Carry 3 flour from the mill to the bakery (4s)')).toBeNull();   // a job: it pays the player
    expect(costOf('Sell bread (2s)')).toBeNull();
    expect(costOf('Goodbye')).toBeNull();
  });
});
