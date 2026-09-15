import type { GameState } from './state';
import type { TrailWeaponId } from './entities';

export const MAX_UPGRADE_LEVEL = 5;

export function getWeaponLevel(state: GameState, weaponId: number): number {
  return Math.max(1, state.weaponLevels[weaponId] ?? 1);
}

export function getWeaponDamageMultiplier(state: GameState, weaponId: number): number {
  return 1 + (getWeaponLevel(state, weaponId) - 1) * 0.35;
}

export function getWeaponAttackSpeedMultiplier(state: GameState, weaponId: number): number {
  return 1 + (getWeaponLevel(state, weaponId) - 1) * 0.15;
}

export function getWeaponProjectileSize(state: GameState, weaponId: number): number {
  return weaponId === 1 && getWeaponLevel(state, weaponId) >= MAX_UPGRADE_LEVEL ? 8 : 6;
}

export function getStickyWebRadius(state: GameState): number {
  return 120 + (getWeaponLevel(state, 3) - 1) * 20;
}

export function getTrailWeaponId(state: GameState): TrailWeaponId | null {
  const id = state.unlockedWeapons.find(weaponId => weaponId >= 4 && weaponId <= 6);
  return id as TrailWeaponId | undefined ?? null;
}

export function getTrailLevel(state: GameState, weaponId: TrailWeaponId): number {
  return getWeaponLevel(state, weaponId);
}

export function getTrailWidth(state: GameState, weaponId: TrailWeaponId): number {
  const level = getTrailLevel(state, weaponId);
  // Keep the trail visibly behind the slime instead of turning it into a
  // full-width ribbon. The hero size still controls the footprint.
  return state.player.size * (0.92 + (level - 1) * 0.10);
}

export function getTrailLifetime(state: GameState, weaponId: TrailWeaponId): number {
  const level = getTrailLevel(state, weaponId);
  return 3.5 + (level - 1) * 0.5;
}

export function getTrailEffectStats(state: GameState, weaponId: TrailWeaponId) {
  const level = getTrailLevel(state, weaponId);
  if (weaponId === 4) {
    return {
      damagePerSecond: 8 + (level - 1) * 4,
      duration: 10 + (level - 1) * 2,
      freezeDuration: 0,
      slowDuration: 0,
    };
  }
  if (weaponId === 5) {
    return {
      damagePerSecond: 5 + (level - 1) * 2,
      duration: 0,
      freezeDuration: 0,
      slowDuration: 0,
    };
  }
  return {
    damagePerSecond: 0,
    duration: 0,
    freezeDuration: 5 + (level - 1) * 0.5,
    slowDuration: 15 + (level - 1) * 2,
  };
}