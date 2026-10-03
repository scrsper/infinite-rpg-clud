import { describe, expect, it } from 'vitest';
import { BridgeSession } from '../src/bridge/session';
import { PlayerLanguage } from '../src/server/playerLanguage';
import { canonicalDigest } from '../src/observatory/fingerprint';

function fixture() {
  const session = new BridgeSession(918271), w = session.world, player = w.person(w.playerId)!;
  const npc = w.persons().find(p => p.id !== player.id && !p.hostile && p.age > 20)!;
  const body = w.primaryBody(npc.id)!; body.pose = 'stand';
  w.primaryBody(player.id)!.pos = { ...body.pos };
  player.mind.percepts = [{ entityId: npc.id, bodyId: body.id, how: 'saw', pos: { ...body.pos }, tick: w.now, distance: 0 }];
  expect(session.intent({ version: 1, sequence: 1, type: 'talk', targetBodyId: body.id }).result).toBe('accepted');
  return { session, w, player, npc, body, revision: session.channel()!.dialogueRevision };
}
describe('deterministic player dialogue boundary', () => {
  it('typed farewell closes the ordinary conversation and discards context', async () => {
    const f = fixture(), language = new PlayerLanguage(f.session);
    expect((await language.ask('local', 2, f.revision, 'Goodbye')).result).toBe('spoken');
    expect(f.session.channel()!.dialogueState).toBeNull();
    expect((await language.ask('local', 3, f.revision, 'When?')).result).toBe('conversation_changed');
  });
  it('returns only speech and rejects duplicate canonical dispatch', async () => {
    const f = fixture(), language = new PlayerLanguage(f.session);
    const result = await language.ask('local', 2, f.revision, 'Hello');
    expect(result.result).toBe('spoken'); expect(result.speech).toContain(f.npc.name);
    expect(Object.keys(result).sort()).toEqual(['fallback', 'result', 'speech']);
    const state = canonicalDigest(f.w);
    expect((await language.ask('local', 2, f.revision, 'Hello')).result).toBe('conversation_already_submitted');
    expect(canonicalDigest(f.w)).toBe(state);
  });
  it('surface variants produce the same canonical effects', async () => {
    const a = fixture(), b = fixture();
    await new PlayerLanguage(a.session).ask('local', 2, a.revision, 'Hello');
    await new PlayerLanguage(b.session).ask('local', 2, b.revision, 'Greetings!');
    expect(canonicalDigest(a.w)).toBe(canonicalDigest(b.w));
  });
  it('refuses stale revisions, closed dialogue and forged channels without effects', async () => {
    const f = fixture(), language = new PlayerLanguage(f.session), before = canonicalDigest(f.w);
    expect((await language.ask('forged-channel', 2, f.revision, 'Hello')).result).toBe('conversation_changed');
    expect((await language.ask('local', 2, f.revision-1, 'Hello')).result).toBe('conversation_changed');
    expect(canonicalDigest(f.w)).toBe(before);
    f.session.intent({ version: 1, sequence: 3, type: 'dialogue_close' });
    const closed = canonicalDigest(f.w);
    expect((await language.ask('local', 4, f.revision, 'Hello')).result).toBe('conversation_changed');
    expect(canonicalDigest(f.w)).toBe(closed);
  });
});
