import { describe, it, expect } from 'vitest';
import { addPerson, createTestWorld, v } from './helpers/world';
import { learn } from '../src/sim/mind/knowledge';
import { introduce, learnIdentity } from '../src/sim/mind/people';
import { LanguageService } from '../src/language/service';
import { serialize, deserialize } from '../src/sim/persist/save';
import { canonicalDigest } from '../src/observatory/fingerprint';
import { makeItem } from '../src/sim/world/factory';
import { DialogueSystem } from '../src/sim/mind/dialogue';
import { converse } from '../src/sim/mind/conversationalIntent';
function fixture() {
  const f = createTestWorld(3489, 32), player = addPerson(f, 'Traveler', 'villager', v(28, 1, 3), { controlled: true });
  const npc = addPerson(f, 'Mara', 'innkeeper', v(29, 1, 3), { controlled: true, workId: f.places.tavern });
  const edwin = addPerson(f, 'Edwin', 'smith', v(5, 1, 5), { controlled: true });
  learnIdentity(f.world, player, edwin.id, 'Edwin', { type: 'prior' }); learnIdentity(f.world, npc, edwin.id, 'Edwin', { type: 'prior' });
  learn(f.world, npc, { key: `loc:${edwin.id}`, kind: 'location', claim: { entityId: edwin.id, pos: v(7, 1, 8) }, confidence: .9, source: { type: 'witnessed' } });
  return { ...f, player, npc, edwin, language: new LanguageService() };
}
describe('canonical deterministic conversation acceptance', () => {
  it('a missing new item cannot reuse the previous stock id, and clarification discards stale accounts', async () => {
    const f = fixture();
    const context = { itemId: 'previous-flour', itemType: 'flour', personId: f.edwin.id, knowledgeId: `loc:${f.edwin.id}`, subject: 'Edwin' };
    const none = await f.language.ask(f.sim, f.player, f.npc, 'Do you have bread?', undefined, undefined, context);
    expect(none.nextContext.itemId).toBeUndefined(); expect(none.nextContext.itemType).toBe('bread');
    const unclear = await f.language.ask(f.sim, f.player, f.npc, 'zxqv', undefined, undefined, context);
    expect(unclear.nextContext.knowledgeId).toBeUndefined(); expect(unclear.nextContext.personId).toBeUndefined();
  });
  it('free text can offer an actually held account, but cannot invent testimony', async () => {
    const f = fixture(), key = 'fact:road';
    learn(f.world, f.player, { key, kind: 'fact', claim: { text: 'the old road is flooded' }, confidence: .7, source: { type: 'witnessed' } });
    const r = await f.language.ask(f.sim, f.player, f.npc, 'I saw that the old road is flooded');
    expect(r.canonical.reason, JSON.stringify(r.parsed)).toBe('testimony'); expect(f.npc.knowledge[key].source.from).toBe(f.player.id);
    const before = canonicalDigest(f.world);
    expect((await f.language.ask(f.sim, f.player, f.npc, 'I heard the mill burned down')).canonical.reason).toBe('unsupported_information');
    expect(canonicalDigest(f.world)).toBe(before);
  });
  it('occupational aliases come from supported declarations and retain known names', async () => {
    const f = fixture(); f.npc.occupation = 'smith'; introduce(f.world, f.npc, f.player);
    const job = await f.language.ask(f.sim, f.player, f.npc, 'What do you do?');
    expect(job.canonical.reason).toBe('self_occupation');
    expect(f.player.knowledge[`occupation:${f.npc.id}`].source.from).toBe(f.npc.id);
    const named = await f.language.ask(f.sim, f.player, f.npc, 'Have you seen the blacksmith?');
    expect(named.parsed.chosen.personId).toBe(f.npc.id); expect(named.generated.output.speech).toBe('I am right here.');
  });
  it('surface location variants have identical canonical effects and use belief position, not actual position', async () => {
    const digests: string[] = [];
    for (const text of ["Where's Edwin?", 'Have you seen Edwin?', 'Do you know where Edwin is?', 'Edwin around?']) {
      const f = fixture(), r = await f.language.ask(f.sim, f.player, f.npc, text);
      expect(r.generated.output.speech).toContain('(7, 8)'); expect(r.generated.output.speech).not.toContain('(5, 5)');
      expect(r.canonical.spokenKnowledgeIds).toContain(`loc:${f.edwin.id}`); digests.push(canonicalDigest(f.world));
    }
    expect(new Set(digests).size).toBe(1);
  });
  it('provenance, time and certainty follow-ups use the actual previous account', async () => {
    const f = fixture(); introduce(f.world, f.player, f.npc);
    const k = f.npc.knowledge[`loc:${f.edwin.id}`]; k.source = { type: 'told', from: f.player.id }; k.hops = 1; k.confidence = .5;
    const r = await f.language.ask(f.sim, f.player, f.npc, 'Where is Edwin?');
    expect(r.generated.output.speech).toContain('cannot be certain');
    const follow = await f.language.ask(f.sim, f.player, f.npc, 'Who told you that?', undefined, undefined, r.nextContext);
    expect(follow.generated.output.speech).toContain('Traveler told me');
    const sure = await f.language.ask(f.sim, f.player, f.npc, 'Are you sure?', undefined, undefined, follow.nextContext);
    expect(sure.generated.output.speech).toContain('I did not see it myself');
    const when = await f.language.ask(f.sim, f.player, f.npc, 'When?', undefined, undefined, sure.nextContext);
    expect(when.generated.output.speech).toContain('world minutes ago');
  });
  it('recognition never grants NPC knowledge and unknown or negated purchases cause no mutation', async () => {
    const f = fixture(); delete f.npc.knowledge[`identity:${f.edwin.id}`];
    const r = await f.language.ask(f.sim, f.player, f.npc, 'Where is Edwin?');
    expect(r.canonical.reason).toBe('unknown_person'); expect(r.generated.output.speech).not.toContain('(7, 8)');
    const before = canonicalDigest(f.world);
    for (const text of ['Where is he?', 'Do not buy bread', "I won't buy bread", "I shouldn't buy bread", "I'd buy bread", 'Do you buy bread', 'Can you buy bread', 'Can you sell bread', 'Sell me bread', 'buy bread from Mara', 'Maybe buy bread', 'buy bread and sell flour', 'buy 0 bread', 'buy 100000 bread', 'buy -1 bread', 'buy 1.5 bread', 'no buy bread', 'how do I buy bread', 'buy two hundred bread', 'buy flour and bread', '???']) {
      const r = await f.language.ask(f.sim, f.player, f.npc, text);
      expect(r.canonical.reason, text).toBe('clarification'); expect(canonicalDigest(f.world)).toBe(before);
    }
  });
  it('free-text purchase and suggested purchase use the identical validated transaction and social effect', async () => {
    const run = async (menu: boolean) => {
      const f = fixture(), stock = makeItem(f.world, 'bread', 'bread', { owner: f.npc.id, placeId: f.places.tavern, pos: v(29, 1, 3), quantity: 20, value: 2 });
      f.world.place(f.places.tavern)!.ownerId = f.npc.id; f.npc.needs.hunger = 0; f.player.wealth = 100;
      const before = f.player.wealth + f.npc.wealth;
      if (menu) {
        const dialogue = new DialogueSystem(f.world, f.sim).respond(f.npc, f.player, 'trade_menu')!;
        dialogue.options.find(o => o.label.startsWith('Buy bread'))!.next();
      } else {
        const quote = await f.language.ask(f.sim, f.player, f.npc, 'How much for bread?');
        expect(quote.canonical.reason).toBe('trade_quote'); expect(f.player.wealth + f.npc.wealth).toBe(before);
        const r = await f.language.ask(f.sim, f.player, f.npc, "I'll take one", undefined, undefined, quote.nextContext);
        expect(r.canonical.reason).toBe('purchase');
      }
      expect(stock.quantity).toBe(19); expect(f.player.wealth + f.npc.wealth).toBe(before);
      return { f, hash: canonicalDigest(f.world) };
    };
    const a = await run(true), b = await run(false); expect(a.hash).toBe(b.hash);
    const restored = deserialize(serialize(b.f.world))!;
    expect(restored.world.person(b.f.player.id)!.inventory).toEqual(b.f.player.inventory);
    expect(restored.world.person(b.f.npc.id)!.relationships).toEqual(b.f.npc.relationships);
    expect(restored.world.item(b.f.world.items().find(i => i.type === 'bread' && i.holderId === b.f.player.id)!.id)!.quantity).toBe(1);
  });
  it('same social act wording yields the same event and persisted effect', async () => {
    const a = fixture(), b = fixture();
    await a.language.ask(a.sim, a.player, a.npc, 'You fool!'); await b.language.ask(b.sim, b.player, b.npc, 'You are an idiot.');
    expect(canonicalDigest(a.world)).toBe(canonicalDigest(b.world));
    expect(a.world.events.at(-1)?.data.speechAct).toBe('insult');
    const loaded = deserialize(serialize(a.world))!; expect(loaded.world.events.at(-1)?.data.speechAct).toBe('insult');
  });
  it('cancellation and reach are checked before any canonical effect', async () => {
    const f = fixture(), abort = new AbortController(); abort.abort(); const before = canonicalDigest(f.world);
    await expect(f.language.ask(f.sim, f.player, f.npc, 'Hello', abort.signal)).rejects.toThrow('Cancelled');
    expect(canonicalDigest(f.world)).toBe(before);
    f.world.primaryBody(f.player.id)!.pos = v(1,1,1);
    expect(converse(f.sim, f.player, f.npc, { intent: 'request_purchase', topic: 'bread', itemType: 'bread', quantity: 1, knowledgeId: null }).reason).toBe('not_reachable');
  });
});
