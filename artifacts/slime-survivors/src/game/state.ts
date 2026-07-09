import { Player, Enemy, Projectile, XPOrb, DamageText, Lake, AppleTree, Apple, Chest, ArtifactDef, Difficulty, MiniClone } from './entities';

export type GameStatus = 'START' | 'PLAYING' | 'LEVEL_UP' | 'GAME_OVER' | 'WIN' | 'PAUSED' | 'CHEST';

export interface UpgradeOptions {
  id: string;
  label: string;
  apply: (state: GameState) => void;
}

export interface ChestReward {
  type: 'artifact';
  artifact: ArtifactDef;
}

export class GameState {
  status: GameStatus = 'START';
  timeSurvived: number = 0;
  kills: number = 0;
  level: number = 1;
  xp: number = 0;
  xpNeeded: number = 100;

  camera = { x: 0, y: 0 };
  difficulty: Difficulty = 'medium';

  player: Player = {
    id: 'player', x: 0, y: 0,
    heroType: 'blue',
    baseMaxHP: 100, maxHP: 100, currentHP: 100,
    size: 20, speed: 140, vx: 0, vy: 0,
    lakeBuffTimer: 0, inLake: false,
    scaleX: 1, scaleY: 1, targetScale: 1, currentScale: 1,
    animFrame: 0, animTimer: 0, facingLeft: false,
  };

  enemies: Enemy[] = [];
  miniClones: MiniClone[] = [];
  projectiles: Projectile[] = [];
  xpOrbs: XPOrb[] = [];
  damageTexts: DamageText[] = [];
  lakes: Lake[] = [];
  appleTrees: AppleTree[] = [];
  apples: Apple[] = [];
  chests: Chest[] = [];

  unlockedWeapons: number[] = [1];

  stats = {
    damageMultiplier: 1.0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    projectileCountBonus: 0,
  };

  lastEnemySpawnTime: number = 0;
  shakeTime: number = 0;
  invincibilityTimer: number = 0;
  bossBatSpawned: boolean = false;

  upgradeChoices: UpgradeOptions[] = [];
  chestReward: ChestReward | null = null;

  collectedArtifactIds: string[] = [];
  remainingArtifactIds: string[] = ['magnet', 'thorns', 'regen', 'berserker', 'iron_skin', 'swift'];

  hasArtifact(id: string): boolean {
    return this.collectedArtifactIds.includes(id);
  }
}

export const State = new GameState();
