import type { QualityTier } from './engine';

/**
 * Automatic quality governor. It only ever steps *down*: when the frame time stays clearly over budget for a
 * few seconds it moves to the next cheaper tier, and once on the cheapest tier it lowers the render scale a
 * step at a time. It never steps back up on its own (a display locked to its refresh rate hides how much
 * headroom there really is, so "faster" cannot be told from "capped"); the player can raise the tier in the
 * settings. It is pure so it can be tested: feed it one measurement per evaluation.
 */
export type GovernorAction = { tier: QualityTier } | { scale: number };
const ORDER: QualityTier[] = ['high', 'balanced', 'low'];
/** Render-scale steps once the cheapest tier is not enough. */
export const SCALE_STEPS = [0.85, 0.72, 0.6];

export class QualityGovernor {
  private slow = 0;
  private lastChange = -1e9;
  private scaleIndex = 0;
  constructor(private readonly settleMs = 8000, private readonly slowWindows = 3) {}

  /** `medianMs` / `p95Ms`: frame times over the last couple of seconds of play. `current`: the tier now in force. */
  evaluate(medianMs: number, p95Ms: number, nowMs: number, current: QualityTier): GovernorAction | null {
    if (nowMs - this.lastChange < this.settleMs) return null;   // a change needs time to show its effect
    if (medianMs > 22 || p95Ms > 48) this.slow++; else this.slow = 0;
    if (this.slow < this.slowWindows) return null;
    this.slow = 0; this.lastChange = nowMs;
    const i = ORDER.indexOf(current);
    if (i >= 0 && i < ORDER.length - 1) return { tier: ORDER[i + 1] };
    if (this.scaleIndex < SCALE_STEPS.length) return { scale: SCALE_STEPS[this.scaleIndex++] };
    return null;
  }
  /** Forget history (the player changed a quality setting themselves). */
  reset(nowMs: number): void { this.slow = 0; this.lastChange = nowMs; this.scaleIndex = 0; }
}
