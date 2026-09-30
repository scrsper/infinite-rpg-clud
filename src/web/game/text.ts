/** Player-facing wording for canonical result codes and small formatting helpers. Unknown codes are humanised, never hidden. */
const RESULTS: Record<string, { text: string; tone?: 'good' | 'bad' | 'veil' }> = {
  accepted: { text: 'Done.' },
  invalid_intent: { text: 'That is not possible right now.', tone: 'bad' },
  interaction_unavailable: { text: 'You cannot do that from here.', tone: 'bad' },
  no_body: { text: 'You have no body to act with.', tone: 'bad' },
  dead: { text: 'You are dead.', tone: 'bad' },
  talk_asleep: { text: 'They are asleep.', tone: 'bad' },
  talk_fleeing: { text: 'They are too frightened to talk.', tone: 'bad' },
  talk_refuses: { text: 'They will not speak with you.', tone: 'bad' },
  talk_too_far: { text: 'Step closer to talk.', tone: 'bad' },
  no_dialogue: { text: 'The conversation has ended.', tone: 'bad' },
  invalid_dialogue_option: { text: 'That choice is no longer available.', tone: 'bad' },
  calmed: { text: 'The beast settles.', tone: 'veil' },
  resisted: { text: 'It resisted the hush.', tone: 'veil' },
  too_strained: { text: 'You are too strained to hush anything.', tone: 'bad' },
  invalid_target: { text: 'Nothing to hush there.', tone: 'bad' },
  timeout: { text: 'No answer from the world. Check your connection.', tone: 'bad' },
  not_connected: { text: 'You are not connected.', tone: 'bad' },
  replay: { text: 'Recorded session: nothing was sent.' },
};
export function describeResult(code: string): { text: string; tone: 'good' | 'bad' | 'veil' | 'info' } {
  const r = RESULTS[code]; if (r) return { text: r.text, tone: r.tone ?? 'info' };
  const human = code.replace(/[_:]+/g, ' ').trim(); return { text: human ? human[0].toUpperCase() + human.slice(1) + '.' : 'Done.', tone: 'info' };
}
export const TALK_REASON: Record<string, string> = { asleep: 'asleep', fleeing: 'frightened', refuses: 'will not talk', too_far: 'too far' };
export function clockText(worldSeconds: number): { day: number; hour: number; text: string } {
  const day = Math.floor(worldSeconds / 86400) + 1, s = ((worldSeconds % 86400) + 86400) % 86400, hour = s / 3600, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
  return { day, hour, text: `Day ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
export function daypart(hour: number): string { return hour < 4.5 ? 'Deep night' : hour < 6.5 ? 'Dawn' : hour < 11 ? 'Morning' : hour < 14 ? 'Midday' : hour < 17.5 ? 'Afternoon' : hour < 20 ? 'Dusk' : 'Night'; }
export const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
