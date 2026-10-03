import { INTERACTION_SPEC, predictMovement, predictPosture, windowQuery, type CollisionWindow, type ColumnQuery, type MovementInput, type MovementState } from '../../sim/physical/prediction';
import type { CommandReceiptMessage, LocalStateMessage, Vec3 } from '../net/messages';

/**
 * Disposable client prediction of the player's own movement.
 *
 * The server is the only authority. Each fixed 1/60 s step the player's intent is (a) sent as one
 * epoch-bound `move` command and (b) applied to a local copy of the server's own pure movement
 * kernel (src/sim/physical/prediction.ts, imported unchanged: same collision, step height, facing
 * turn rate, crouch curve). When `local_state` arrives, the confirmed state replaces the base,
 * commands the server has applied (`ack`) are dropped and the rest are replayed on top. Any
 * difference is absorbed into a bounded visual offset that decays; a large one snaps, because a
 * real invalid move (a wall the client did not know about, a knockback) must not be hidden.
 */
export interface StepInput { x: number; z: number; sprint: boolean; facing?: number; crouch: boolean }
interface Pending { sequence: number; input: StepInput }

const STEP = INTERACTION_SPEC.stepSeconds;
const MAX_PENDING = 15;
const MAX_CATCHUP = 6;
const SNAP_METRES = 1.5;
const SETTLE_PER_SECOND = 14;

export class LocalPredictor {
  confirmed: MovementState | null = null;
  predicted: MovementState | null = null;
  window: CollisionWindow | null = null;
  private column: ColumnQuery = () => undefined;
  private pending: Pending[] = [];
  private accumulator = 0;
  private offset: Vec3 = { x: 0, y: 0, z: 0 };
  private crouchHeldByServer = false;
  /** Server ticks since the last confirmation, for diagnostics. */
  stepsAhead = 0;
  corrections = { smoothed: 0, snapped: 0, maxMetres: 0 };

  get hasState(): boolean { return this.predicted !== null; }
  get inFlight(): number { return this.pending.length; }
  reset(): void { this.confirmed = null; this.predicted = null; this.pending = []; this.accumulator = 0; this.offset = { x: 0, y: 0, z: 0 }; }

  /** The position the body should be drawn at: prediction plus the decaying correction. */
  visual(): { pos: Vec3; yaw: number; crouch: number } | null {
    const p = this.predicted; if (!p) return null;
    return { pos: { x: p.pos.x + this.offset.x, y: p.pos.y + this.offset.y, z: p.pos.z + this.offset.z }, yaw: p.yaw, crouch: p.crouch ?? 0 };
  }

  applyLocalState(m: LocalStateMessage): void {
    if (m.geometry) { this.window = m.geometry; this.column = windowQuery(m.geometry); }
    const before = this.predicted ? { ...this.predicted.pos } : null;
    this.confirmed = { ...m.state, pos: { ...m.state.pos } };
    this.crouchHeldByServer = m.crouchHeld;
    this.pending = this.pending.filter(p => p.sequence > m.ack);
    this.replay();
    if (before && this.predicted) {
      const dx = before.x - this.predicted.pos.x, dy = before.y - this.predicted.pos.y, dz = before.z - this.predicted.pos.z, d = Math.hypot(dx, dz);
      if (d > SNAP_METRES || Math.abs(dy) > 1.2) { this.offset = { x: 0, y: 0, z: 0 }; this.corrections.snapped++; }
      else if (d > 0.002) { this.offset = { x: this.offset.x + dx, y: this.offset.y + dy, z: this.offset.z + dz }; this.corrections.smoothed++; }
      this.corrections.maxMetres = Math.max(this.corrections.maxMetres, d);
    }
    this.stepsAhead = this.pending.length;
  }
  /** A rejected or cancelled move never happened on the server: forget it instead of replaying it. */
  applyReceipt(r: CommandReceiptMessage): void {
    if (r.status !== 'rejected' && r.status !== 'cancelled') return;
    const i = this.pending.findIndex(p => p.sequence === r.sequence);
    if (i >= 0) { this.pending.splice(i, 1); this.replay(); }
  }
  private replay(): void {
    if (!this.confirmed) return;
    let s: MovementState = { ...this.confirmed, pos: { ...this.confirmed.pos } };
    for (const p of this.pending) s = this.advance(s, p.input);
    this.predicted = s;
  }
  private advance(state: MovementState, input: StepInput): MovementState {
    const move: MovementInput = { x: input.x, z: input.z, sprint: input.sprint, ...(input.facing !== undefined ? { facing: input.facing } : {}) };
    let s = predictMovement(state, move, STEP, this.column);
    s = predictPosture(s, input.crouch, STEP, this.column);
    return s;
  }

  /**
   * Advance by `dt` of real time. For each whole fixed step the caller's `send` is asked to transmit
   * the command; if it accepts (returns the sequence) the step is applied locally and remembered
   * until the server acknowledges it. If the wire is backed up or the server is behind, no step is
   * taken: prediction never runs ahead of what has actually been sent.
   */
  advanceBy(dt: number, wants: (facingNow: number) => StepInput | null, send: (input: StepInput) => number | null): void {
    // Settle the visual correction toward zero.
    const k = Math.exp(-SETTLE_PER_SECOND * Math.min(dt, .1));
    this.offset = { x: this.offset.x * k, y: this.offset.y * k, z: this.offset.z * k };
    if (!this.predicted) return;
    this.accumulator = Math.min(this.accumulator + Math.min(dt, .1), STEP * MAX_CATCHUP);
    let count = 0;
    while (this.accumulator + 1e-9 >= STEP && count < MAX_CATCHUP && this.pending.length < MAX_PENDING) {
      const input = wants(this.predicted.yaw);
      if (!input) { this.accumulator = 0; break; }
      const sequence = send(input);
      if (sequence === null) break;
      this.accumulator -= STEP; count++;
      this.pending.push({ sequence, input });
      this.predicted = this.advance(this.predicted, input);
    }
  }
  /** True while the server still holds crouch the player has released (used to keep sending until it settles). */
  get serverCrouchHeld(): boolean { return this.crouchHeldByServer; }
}
