export type Entity = { id: string; x: number; y: number; };

export type OrbColor = 'orange' | 'green' | 'purple';
export type EnemyType = 'bat' | 'goblin' | 'skeleton' | 'ogre';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type HeroType = 'blue' | 'green' | 'purple';

export interface Player extends Entity {
  heroType: HeroType;
  baseMaxHP: number;
  maxHP: number;
  currentHP: number;
  size: number;           // collision radius
  speed: number;
  vx: number; vy: number;
  lakeBuffTimer: number;
  inLake: boolean;
  scaleX: number; scaleY: number;
  targetScale: number; currentScale: number;
  animFrame: number;
  animTimer: number;
  facingLeft: boolean;
}

export interface MiniClone extends Entity {
  heroType: HeroType;
  maxHP: number;
  currentHP: number;
  size: number;
  speed: number;
  vx: number; vy: number;
  animFrame: number; animTimer: number;
  facingLeft: boolean;
  weaponCooldown: number;
}

export interface Enemy extends Entity {
  type: EnemyType;
  maxHP: number; currentHP: number;
  speed: number; damagePerSec: number;
  xp: number; size: number;
  vx: number; vy: number;
  slowed: boolean;
  animFrame: number;
  animTimer: number;
  facingLeft: boolean;
  isBoss?: boolean;   // immortal boss — never removed, triggers WIN on kill
}

export interface Projectile extends Entity {
  vx: number; vy: number;
  speed: number; damage: number;
  range: number; distanceTraveled: number;
  weaponId: number; lifeTime: number;
}

export interface XPOrb extends Entity {
  amount: number;
  collected: boolean;
  targetPlayer: boolean;
  color: OrbColor;
}

export interface DamageText extends Entity {
  text: string;
  lifeTime: number; maxLifeTime: number;
  color: string;
}

export interface Lake {
  id: string;
  x: number; y: number;
  widthTiles: number;
  heightTiles: number;
  seed: number;
}

export interface AppleTree extends Entity {
  appleTimer: number;
  hasApple: boolean;
}

export interface Apple extends Entity {
  treeId: string;
}

export interface Chest extends Entity {
  opened: boolean;
}

export interface ArtifactDef {
  id: string;
  nameKey: string;
  descKey: string;
}
