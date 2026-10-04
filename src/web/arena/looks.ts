/**
 * Arena cast: realistic MPFB people dressed in CC0/CC-BY MakeHuman community clothing, built by
 * art/tools/arena/build_arena_people.py into web/public/arena/people/<id>.glb.
 */
export const LOOK_IDS = ['ranger', 'brann', 'wren', 'raider', 'raider_f', 'soldier', 'knight', 'archer', 'mystic'] as const;
export type LookId = typeof LOOK_IDS[number];
