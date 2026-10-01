import type { BridgeSession } from '../bridge/session';
import type { ConversationContext } from '../language/parser';
import { LanguageService } from '../language/service';

/** The only language payload sent to a player. Never forward the service's diagnostic envelope. */
export interface PlayerSpeech { result: string; speech?: string; fallback?: boolean }
interface Pending { controller: AbortController; sequence: number }

/** Transport adapter over the existing canonical conversation and bounded wording service. */
export class PlayerLanguage {
  private readonly pending = new Map<string, Pending>();
  private readonly lastSequence = new Map<string, number>();
  private readonly contexts = new Map<string, { revision: number; context: ConversationContext }>();
  constructor(private readonly session: BridgeSession, private readonly language = new LanguageService()) {}

  cancel(channelId: string): void { this.pending.get(channelId)?.controller.abort(); this.pending.delete(channelId); }
  release(channelId: string): void { this.cancel(channelId); this.lastSequence.delete(channelId); this.contexts.delete(channelId); }
  async ask(channelId: string, sequence: unknown, revision: unknown, text: unknown): Promise<PlayerSpeech> {
    if (!Number.isSafeInteger(sequence) || (sequence as number) < 0 || typeof text !== 'string' || !text.trim() || text.length > 1000) return { result: 'invalid_conversation' };
    const seq = sequence as number;
    // A repeated transport submission cannot duplicate testimony or any other canonical effect.
    if (seq <= (this.lastSequence.get(channelId) ?? -1)) return { result: 'conversation_already_submitted' };
    if (this.pending.has(channelId)) return { result: 'conversation_busy' };
    const ch = this.session.channel(channelId), state = ch?.dialogueState;
    const player = ch ? this.session.world.person(ch.personId) : null;
    if (!ch || !state || !player || revision !== ch.dialogueRevision) return { result: 'conversation_changed' };
    const bodyId = ch.dialogueSpeakerBodyId;
    const current = () => this.session.channel(channelId) === ch && ch.dialogueState === state && ch.dialogueRevision === revision &&
      ch.dialogueSpeakerBodyId === bodyId && this.session.canContinueDialogue(channelId, ch.dialogueRevision);
    if (!current()) return { result: 'interaction_unavailable' };
    this.lastSequence.set(channelId, seq);
    const job = { controller: new AbortController(), sequence: seq };
    this.pending.set(channelId, job);
    try {
      const previous = this.contexts.get(channelId);
      const answer = await this.language.ask(this.session.sim, player, state.speaker, text.trim(), job.controller.signal, current, previous?.revision === revision ? previous.context : {});
      if (job.controller.signal.aborted || !current()) return { result: 'conversation_changed' };
      this.contexts.set(channelId, { revision: revision as number, context: answer.nextContext });
      if (answer.canonical.reason === 'goodbye') {
        this.session.intent({ version: 1, sequence: seq, type: 'dialogue_close' }, channelId);
        this.contexts.delete(channelId);
      }
      return { result: answer.canonical.accepted ? 'spoken' : answer.canonical.reason, speech: answer.generated.output.speech, fallback: answer.generated.fallback };
    } catch { return { result: 'conversation_changed' }; }
    finally { if (this.pending.get(channelId) === job) this.pending.delete(channelId); }
  }
}
