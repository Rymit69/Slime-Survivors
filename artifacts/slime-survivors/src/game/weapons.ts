import { Player, Enemy, Projectile } from './entities';
import type { GameState } from './state';

export interface Weapon {
  id: number;
  name: string;
  baseCooldown: number;
  currentCooldown: number;
  fire: (state: GameState, player: Player, enemies: Enemy[]) => void;
}

export const createWeapons = (): Record<number, Weapon> => ({
  1: {
    id: 1,
    name: "Slime Bolt",
    baseCooldown: 1.2,
    currentCooldown: 0,
    fire: (state: GameState, player: Player, enemies: Enemy[]) => {
      let nearest = null;
      let minDist = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < minDist && d < 400) { minDist = d; nearest = e; }
      }
      if (!nearest) return;
      
      const count = 1 + state.stats.projectileCountBonus;
      for (let i = 0; i < count; i++) {
        const angleOffset = count > 1 ? (i - (count-1)/2) * 0.2 : 0;
        const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x) + angleOffset;
        state.projectiles.push({
          id: Math.random().toString(),
          x: player.x, y: player.y,
          vx: Math.cos(angle), vy: Math.sin(angle),
          speed: 250, damage: 25 * state.stats.damageMultiplier, range: 400,
          distanceTraveled: 0, weaponId: 1, lifeTime: 0
        });
      }
    }
  },
  2: {
    id: 2,
    name: "Slime Spray",
    baseCooldown: 2.0,
    currentCooldown: 0,
    fire: (state: GameState, player: Player, enemies: Enemy[]) => {
      const count = 6 + state.stats.projectileCountBonus;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        state.projectiles.push({
          id: Math.random().toString(),
          x: player.x, y: player.y,
          vx: Math.cos(angle), vy: Math.sin(angle),
          speed: 150, damage: 15 * state.stats.damageMultiplier, range: 300,
          distanceTraveled: 0, weaponId: 2, lifeTime: 0
        });
      }
    }
  },
  3: {
    id: 3,
    name: "Sticky Web",
    baseCooldown: 0, 
    currentCooldown: 0,
    fire: (state: GameState, player: Player, enemies: Enemy[]) => {
      // Handled in main loop (passive effect)
    }
  }
});
