import type { GameState } from './state';

export const MAX_UPGRADE_LEVEL = 5;

export function getWeaponLevel(state: GameState, weaponId: number): number {
  return Math.max(1, state.weaponLevels[weaponId] ?? 1);
}

export function getWeaponDamageMultiplier(state: GameState, weaponId: number): number {
  return 1 + (getWeaponLevel(state, weaponId) - 1) * 0.2;
}

export function getWeaponAttackSpeedMultiplier(state: GameState, weaponId: number): number {
  return 1 + (getWeaponLevel(state, weaponId) - 1) * 0.15;
}

export function getStickyWebRadius(state: GameState): number {
  return 120 + (getWeaponLevel(state, 3) - 1) * 20;
}