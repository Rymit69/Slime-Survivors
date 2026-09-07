import { AbilityTarget, GameState, State, UpgradeOptions } from './state';
import { OrbColor, Enemy, EnemyType, Difficulty, HeroType, MiniClone, TrailWeaponId } from './entities';
import { Input } from './input';
import { render } from './renderer';
import { generateLakes, isInsideLake, generateAppleTrees, TILE_SIZE } from './world';
import { createWeapons } from './weapons';
import { t } from './lang';
import { ALL_ARTIFACTS } from './artifacts';
import {
  getStickyWebRadius,
  getWeaponAttackSpeedMultiplier,
  getWeaponLevel,
  getWeaponProjectileSize,
  MAX_UPGRADE_LEVEL,
  getTrailEffectStats,
  getTrailLifetime,
  getTrailWeaponId,
  getTrailWidth,
} from './upgradeMath';

let animationFrameId = 0;
let lastTime = 0;
const weapons = createWeapons();

const BASE_MAX_HP = 100;
const BASE_SIZE = 20;
const ANIM_SPEED = 0.2;

// A polynomial XP curve: each level costs more, but growth is not geometric.
export function getXpRequiredForLevel(level: number): number {
  const step = Math.max(0, level - 1);
  return 100 + step * 70 + step * step * 5;
}

// ── Difficulty helpers ───────────────────────────────────────────────────────
// Enemy spawn rate is measured relative to Easy: 1× / 2× / 3×.
function diffMultiplier(d: Difficulty) { return d === 'easy' ? 1 : d === 'medium' ? 2 : 3; }
function maxEnemies(d: Difficulty)  { return d === 'easy' ? 20 : d === 'medium' ? 40 : 60; }

// ── Hero projectile color ────────────────────────────────────────────────────
export function heroColor(h: HeroType): string {
  if (h === 'green')  return '#44dd00';
  if (h === 'purple') return '#bb44ff';
  return '#4488ff';
}

// ── XP orb color by enemy type ───────────────────────────────────────────────
function pickOrbColor(type: EnemyType): OrbColor {
  const r = Math.random() * 100;
  if (type === 'bat')      { if (r < 1) return 'purple'; if (r < 11) return 'green'; }
  if (type === 'goblin')   { if (r < 10) return 'purple'; if (r < 35) return 'green'; }
  if (type === 'skeleton') { if (r < 25) return 'purple'; if (r < 75) return 'green'; }
  if (type === 'ogre')     { if (r < 50) return 'purple'; return 'green'; }
  return 'orange';
}
function orbMultiplier(c: OrbColor) { return c === 'purple' ? 5 : c === 'green' ? 2 : 1; }

// ── Hero base stats ──────────────────────────────────────────────────────────
function heroBaseStats(hero: HeroType) {
  if (hero === 'green')  return { baseMaxHP: 70,  speed: 140, damageBonus: 0.3,  atkSpdBonus: 0 };
  if (hero === 'purple') return { baseMaxHP: 150, speed: 98,  damageBonus: 0,    atkSpdBonus: -0.2 };
  return                        { baseMaxHP: 100, speed: 140, damageBonus: 0,    atkSpdBonus: 0 };
}

// ── Public API ───────────────────────────────────────────────────────────────
export function startGameLoop(
  canvas: HTMLCanvasElement,
  onStateChange: (s: GameState) => void,
  difficulty: Difficulty = 'medium',
  hero: HeroType = 'blue',
) {
  const ctx = canvas.getContext('2d')!;
  const hs = heroBaseStats(hero);

  State.status = 'PLAYING';
  State.timeSurvived = 0;
  State.kills = 0;
  State.level = 1;
  State.xp = 0;
  State.xpNeeded = getXpRequiredForLevel(1);
  State.difficulty = difficulty;
  State.invincibilityTimer = 0;

  State.player = {
    id: 'player', x: 0, y: 0,
    heroType: hero,
    baseMaxHP: hs.baseMaxHP, maxHP: hs.baseMaxHP, currentHP: hs.baseMaxHP,
    size: BASE_SIZE, speed: hs.speed, vx: 0, vy: 0,
    lakeBuffTimer: 0, inLake: false,
    scaleX: 1, scaleY: 1, targetScale: 1, currentScale: 1,
    animFrame: 0, animTimer: 0, facingLeft: false,
  };
  State.enemies = [];
  State.miniClones = [];
  State.projectiles = [];
  State.xpOrbs = [];
  State.damageTexts = [];
  State.trailSegments = [];
  State.apples = [];
  State.chests = [];
  State.chestReward = null;
  State.collectedArtifactIds = [];
  State.remainingArtifactIds = ALL_ARTIFACTS.map(a => a.id);

  State.stats = {
    damageMultiplier: 1.0 + hs.damageBonus,
    attackSpeedMultiplier: 1.0 + hs.atkSpdBonus,
    moveSpeedMultiplier: 1.0,
    projectileCountBonus: 0,
  };
  State.unlockedWeapons = [1];
  State.weaponLevels = { 1: 1 };
  State.upgradeLevels = {};
  State.removedUpgradeIds = [];
  State.upgradeMaxLevelBonuses = {};
  State.removalActionUsed = false;
  State.bossSkeletonSpawned = false;
  State.lastEnemySpawnTime = 0;
  State.shakeTime = 0;
  State.bossBatSpawned = false;
  State.chestRewardsRemaining = 0;
  State.currentChestKind = 'normal';

  State.lakes = generateLakes(20);
  State.appleTrees = generateAppleTrees(3 + Math.floor(Math.random() * 3), State.lakes);

  Object.values(weapons).forEach(w => { w.currentCooldown = 0; });
  lastTime = performance.now();
  animationFrameId = requestAnimationFrame(makeLoop(ctx, canvas, onStateChange));
}

export function resumeGameLoop(
  canvas: HTMLCanvasElement,
  onStateChange: (s: GameState) => void,
) {
  lastTime = performance.now();
  State.status = 'PLAYING';
  const ctx = canvas.getContext('2d')!;
  animationFrameId = requestAnimationFrame(makeLoop(ctx, canvas, onStateChange));
}

export function stopGameLoop() { cancelAnimationFrame(animationFrameId); }

function makeLoop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  onStateChange: (s: GameState) => void,
) {
  function loop(time: number) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    update(dt, canvas.width, canvas.height, onStateChange);
    render(ctx, State, canvas.width, canvas.height);
    if (State.status === 'PLAYING') {
      animationFrameId = requestAnimationFrame(loop);
    } else {
      render(ctx, State, canvas.width, canvas.height);
    }
  }
  return loop;
}

function trailSegmentTouchesEnemy(
  segment: { x: number; y: number },
  enemy: { x: number; y: number; size: number },
  width: number,
) {
  return Math.hypot(segment.x - enemy.x, segment.y - enemy.y) <= width / 2 + enemy.size;
}

function applyTrailEffect(enemy: Enemy, trailWeaponId: TrailWeaponId) {
  if (enemy.isFinalBoss) return;
  const width = getTrailWidth(State, trailWeaponId);
  const touched = State.trailSegments.some(segment =>
    segment.weaponId === trailWeaponId && trailSegmentTouchesEnemy(segment, enemy, width)
  );
  if (!touched) return;

  const effect = getTrailEffectStats(State, trailWeaponId);
  if (trailWeaponId === 4) {
    enemy.burningTimer = Math.max(enemy.burningTimer, effect.duration);
    enemy.burningDamage = Math.max(enemy.burningDamage, effect.damagePerSecond);
    if (enemy.burnTickTimer <= 0) enemy.burnTickTimer = 0.1;
  } else if (trailWeaponId === 5) {
    enemy.poisoned = true;
    enemy.poisonDamage = Math.max(enemy.poisonDamage, effect.damagePerSecond);
  } else if (enemy.frozenTimer <= 0 && enemy.chilledTimer <= 0) {
    enemy.frozenTimer = effect.freezeDuration;
    enemy.chilledTimer = effect.freezeDuration + effect.slowDuration;
  }
}

function updateEnemyEffects(enemy: Enemy, dt: number) {
  if (enemy.burningTimer > 0) {
    enemy.burningTimer -= dt;
    enemy.burnTickTimer -= dt;
    if (enemy.burnTickTimer <= 0) {
      enemy.currentHP -= enemy.burningDamage;
      enemy.burnTickTimer += 1;
      State.damageTexts.push({
        id: Math.random().toString(),
        x: enemy.x + (Math.random() - 0.5) * 12,
        y: enemy.y - enemy.size - 8,
        text: Math.round(enemy.burningDamage).toString(),
        lifeTime: 0.55,
        maxLifeTime: 0.55,
        color: '#ff7733',
      });
    }
    if (enemy.burningTimer <= 0) {
      enemy.burningTimer = 0;
      enemy.burningDamage = 0;
    }
  }

  if (enemy.poisoned) {
    enemy.currentHP -= enemy.poisonDamage * dt;
    enemy.poisonTickTimer -= dt;
    if (enemy.poisonTickTimer <= 0) {
      enemy.poisonTickTimer += 0.8;
      State.damageTexts.push({
        id: Math.random().toString(),
        x: enemy.x + (Math.random() - 0.5) * 12,
        y: enemy.y - enemy.size - 8,
        text: Math.round(enemy.poisonDamage).toString(),
        lifeTime: 0.55,
        maxLifeTime: 0.55,
        color: '#66ff66',
      });
    }
  }

  if (enemy.frozenTimer > 0) enemy.frozenTimer = Math.max(0, enemy.frozenTimer - dt);
  if (enemy.chilledTimer > 0) enemy.chilledTimer = Math.max(0, enemy.chilledTimer - dt);
}

// ── Main update ──────────────────────────────────────────────────────────────
function update(
  dt: number,
  width: number,
  height: number,
  onStateChange: (s: GameState) => void,
) {
  State.timeSurvived += dt;
  if (State.shakeTime > 0) State.shakeTime -= dt;
  if (State.invincibilityTimer > 0) State.invincibilityTimer -= dt;

  // ── Dynamic player size (capped scaling) ────────────────────────────────────
  const hpRatio = State.player.baseMaxHP / BASE_MAX_HP;
  State.player.size = Math.max(10, Math.min(40, BASE_SIZE * Math.sqrt(hpRatio)));

  // ── Artifact passive effects ────────────────────────────────────────────────
  const hasMagnet    = State.hasArtifact('magnet');
  const hasThorns    = State.hasArtifact('thorns');
  const hasRegen     = State.hasArtifact('regen');
  const hasBerserker = State.hasArtifact('berserker');
  const hasIronSkin  = State.hasArtifact('iron_skin');
  const hasSwift     = State.hasArtifact('swift');

  const damageTakenMult  = hasIronSkin ? 0.8 : 1.0;
  const orbAttractionRange = hasMagnet ? 240 : 80;
  const extraDamageMult  = (hasBerserker && State.player.currentHP < State.player.maxHP * 0.5) ? 0.4 : 0.0;
  const effectiveMoveSpeedMult = State.stats.moveSpeedMultiplier + (hasSwift ? 0.25 : 0);

  if (hasRegen) {
    State.player.currentHP = Math.min(State.player.maxHP, State.player.currentHP + 2 * dt);
  }
  if (hasThorns) {
    for (const enemy of State.enemies) {
      if (enemy.isFinalBoss) continue; // only the final boss is immortal
      if (Math.hypot(State.player.x - enemy.x, State.player.y - enemy.y) < 100) {
        enemy.currentHP -= 5 * dt;
      }
    }
  }

  // ── 1. Player movement ──────────────────────────────────────────────────────
  let dx = 0, dy = 0;
  if (Input.touchDx !== 0 || Input.touchDy !== 0) {
    dx = Input.touchDx; dy = Input.touchDy;
  } else {
    if (Input.up)    dy -= 1;
    if (Input.down)  dy += 1;
    if (Input.left)  dx -= 1;
    if (Input.right) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
  }

  State.player.vx = dx * State.player.speed * effectiveMoveSpeedMult;
  State.player.vy = dy * State.player.speed * effectiveMoveSpeedMult;

  // ── Lake mechanic ───────────────────────────────────────────────────────────
  let inLake = false;
  for (const lake of State.lakes) {
    if (isInsideLake(State.player.x, State.player.y, lake)) { inLake = true; break; }
  }
  if (inLake) {
    State.player.vx *= 0.5;
    State.player.vy *= 0.5;
    if (!State.player.inLake && State.player.lakeBuffTimer <= 0) {
      State.player.targetScale = 1.15;
      State.player.maxHP = State.player.baseMaxHP * 1.15;
      State.player.currentHP = Math.min(State.player.currentHP + State.player.baseMaxHP * 0.15, State.player.maxHP);
      State.player.lakeBuffTimer = 60;
    }
    State.player.inLake = true;
  } else {
    State.player.inLake = false;
    if (State.player.lakeBuffTimer > 0) {
      State.player.lakeBuffTimer -= dt;
      if (State.player.lakeBuffTimer <= 0) {
        State.player.targetScale = 1.0;
        State.player.maxHP = State.player.baseMaxHP;
        State.player.currentHP = Math.min(State.player.currentHP, State.player.maxHP);
      }
    }
  }
  State.player.currentScale += (State.player.targetScale - State.player.currentScale) * Math.min(1, dt * 5);

  State.player.x += State.player.vx * dt;
  State.player.y += State.player.vy * dt;
  State.camera.x = State.player.x;
  State.camera.y = State.player.y;

  // ── Player animation ────────────────────────────────────────────────────────
  const isMoving = Math.abs(State.player.vx) > 5 || Math.abs(State.player.vy) > 5;
  if (isMoving) {
    State.player.animTimer += dt;
    if (State.player.animTimer >= ANIM_SPEED) {
      State.player.animTimer = 0;
      State.player.animFrame = 1 - State.player.animFrame;
    }
  } else {
    State.player.animFrame = 0;
  }
  if (State.player.vx < -5) State.player.facingLeft = true;
  else if (State.player.vx > 5) State.player.facingLeft = false;

  // ── 1a. Leave a fading trail behind the slime ───────────────────────────────
  const activeTrailWeapon = getTrailWeaponId(State);
  for (let i = State.trailSegments.length - 1; i >= 0; i--) {
    State.trailSegments[i].age += dt;
    if (State.trailSegments[i].age >= State.trailSegments[i].maxAge) {
      State.trailSegments.splice(i, 1);
    }
  }
  if (activeTrailWeapon && (Math.abs(State.player.vx) > 5 || Math.abs(State.player.vy) > 5)) {
    const last = State.trailSegments[State.trailSegments.length - 1];
    const spacing = Math.max(8, State.player.size * 0.45);
    if (!last || Math.hypot(last.x - State.player.x, last.y - State.player.y) >= spacing) {
      State.trailSegments.push({
        id: Math.random().toString(),
        x: State.player.x,
        y: State.player.y,
        weaponId: activeTrailWeapon,
        age: 0,
        maxAge: getTrailLifetime(State, activeTrailWeapon),
      });
    }
  }

  // ── 1b. Skeleton boss at 6 minutes ───────────────────────────────────────────
  if (!State.bossSkeletonSpawned && State.timeSurvived >= 360) {
    State.bossSkeletonSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(width, height) / 2 + 260;
    const skeletonBossHP = 80 * 50;
    State.enemies.push({
      id: 'boss_skeleton_6m',
      type: 'skeleton',
      isBoss: true,
      x: State.player.x + Math.cos(angle) * distance,
      y: State.player.y + Math.sin(angle) * distance,
      maxHP: skeletonBossHP,
      currentHP: skeletonBossHP,
      speed: 42,
      damagePerSec: 24,
      xp: 150,
      size: 30,
      vx: 0, vy: 0, slowed: false,
      animFrame: 0, animTimer: 0, facingLeft: false,
      burningTimer: 0, burningDamage: 0, burnTickTimer: 0,
      poisoned: false, poisonDamage: 5, poisonTickTimer: 0,
      frozenTimer: 0, chilledTimer: 0,
    });
    State.damageTexts.push({
      id: Math.random().toString(),
      x: State.player.x, y: State.player.y - 60,
      text: t('skeletonBossWarning'),
      lifeTime: 4, maxLifeTime: 4,
      color: '#ffcc44',
    });
  }

  // ── 1c. Final boss at 30 minutes ────────────────────────────────────────────
  if (!State.bossBatSpawned && State.timeSurvived >= 1800) {
    State.bossBatSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    State.enemies.push({
      id: 'boss_bat',
      type: 'bat',
      isBoss: true,
      isFinalBoss: true,
      x: State.player.x + Math.cos(angle) * (width / 2 + 300),
      y: State.player.y + Math.sin(angle) * (height / 2 + 300),
      maxHP: 9_999_999, currentHP: 9_999_999,
      speed: 180,
      damagePerSec: 999,
      xp: 0,
      size: 44,
      vx: 0, vy: 0,
      slowed: false,
      animFrame: 0, animTimer: 0, facingLeft: false,
      burningTimer: 0, burningDamage: 0, burnTickTimer: 0,
      poisoned: false, poisonDamage: 5, poisonTickTimer: 0,
      frozenTimer: 0, chilledTimer: 0,
    });
    State.damageTexts.push({
      id: Math.random().toString(),
      x: State.player.x, y: State.player.y - 60,
      text: t('bossWarning'),
      lifeTime: 4, maxLifeTime: 4,
      color: '#ff2244',
    });
  }

  // ── 2. Spawn enemies ────────────────────────────────────────────────────────
  State.lastEnemySpawnTime += dt;
  const spawnInterval = Math.max(1.5, 5 - State.timeSurvived / 60);
  const spawnMultiplier = diffMultiplier(State.difficulty);
  const cap = maxEnemies(State.difficulty);

  if (State.lastEnemySpawnTime >= spawnInterval / spawnMultiplier && State.enemies.length < cap) {
    State.lastEnemySpawnTime = 0;
    const waveMult = 1 + Math.floor(State.timeSurvived / 30);
    const earlyBoost = Math.max(1, 3 - State.timeSurvived / 60);
    const count = Math.max(1, Math.floor((2 + waveMult) * earlyBoost));

    const canBat      = State.level < 8;
    const canGoblin   = State.level >= 3 && State.level < 15;
    const canSkeleton = State.level >= 8;
    const canOgre     = State.level >= 15;

    // Enemy HP scales +10% per minute after 8 minutes
    const extraMinutes = Math.max(0, Math.floor((State.timeSurvived - 480) / 60));
    const enemyHpMult = 1 + extraMinutes * 0.10;

    for (let i = 0; i < count && State.enemies.length < cap; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = width / 2 + 200 + Math.random() * 100;
      const ex = State.player.x + Math.cos(angle) * dist;
      const ey = State.player.y + Math.sin(angle) * dist;

      let type: EnemyType;
      const r = Math.random();
      if (canOgre && canSkeleton) {
        type = r < 0.18 ? 'ogre' : 'skeleton';
      } else if (canSkeleton && canGoblin) {
        type = r < 0.45 ? 'skeleton' : 'goblin';
      } else if (canGoblin && canBat) {
        type = r < 0.45 ? 'goblin' : 'bat';
      } else if (canSkeleton) {
        type = 'skeleton';
      } else if (canGoblin) {
        type = 'goblin';
      } else {
        type = 'bat';
      }

      let maxHP = 20, speed = 80, dmg = 10, xp = 5, size = 16;
      if (type === 'goblin')   { maxHP = 50;  speed = 60; dmg = 15; xp = 15; size = 20; }
      if (type === 'skeleton') { maxHP = 80;  speed = 50; dmg = 20; xp = 25; size = 22; }
      if (type === 'ogre')     { maxHP = 200; speed = 35; dmg = 30; xp = 60; size = 32; }

      maxHP = Math.round(maxHP * enemyHpMult);

      State.enemies.push({
        id: Math.random().toString(), type,
        x: ex, y: ey, maxHP, currentHP: maxHP,
        speed, damagePerSec: dmg, xp, size,
        vx: 0, vy: 0, slowed: false,
        animFrame: 0, animTimer: Math.random() * ANIM_SPEED, facingLeft: false,
        burningTimer: 0, burningDamage: 0, burnTickTimer: 0,
        poisoned: false, poisonDamage: 5, poisonTickTimer: 0,
        frozenTimer: 0, chilledTimer: 0,
      });
    }
  }

  // ── 3. Update enemies ───────────────────────────────────────────────────────
  const hasWeb = State.unlockedWeapons.includes(3);
  const webRadius = getStickyWebRadius(State);
  for (let i = State.enemies.length - 1; i >= 0; i--) {
    const e = State.enemies[i];
    if (activeTrailWeapon) applyTrailEffect(e, activeTrailWeapon);
    updateEnemyEffects(e, dt);
    const webSlowed = !e.isFinalBoss && hasWeb &&
      Math.hypot(State.player.x - e.x, State.player.y - e.y) <= webRadius;
    const frozen = !e.isFinalBoss && e.frozenTimer > 0;
    const chilled = !e.isFinalBoss && e.chilledTimer > 0;
    e.slowed = webSlowed || chilled || frozen;
    const spd = frozen ? 0 : e.slowed ? e.speed * 0.5 : e.speed;
    const ang = Math.atan2(State.player.y - e.y, State.player.x - e.x);
    e.vx = Math.cos(ang) * spd;
    e.vy = Math.sin(ang) * spd;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    e.animTimer += dt;
    if (e.animTimer >= ANIM_SPEED) { e.animTimer = 0; e.animFrame = 1 - e.animFrame; }
    if (e.vx < -5) e.facingLeft = true;
    else if (e.vx > 5) e.facingLeft = false;

    if (State.invincibilityTimer <= 0) {
      const dist = Math.hypot(State.player.x - e.x, State.player.y - e.y);
      const hitRadius = State.player.size * State.player.currentScale + e.size;
      if (dist < hitRadius) {
        State.player.currentHP -= e.damagePerSec * dt * damageTakenMult;
        if (Math.random() < 0.08) State.shakeTime = 0.15;
      }
    }
  }

  if (State.player.currentHP <= 0) {
    // Was it the boss bat that landed the killing blow?
    const killedByBoss = State.enemies.some(
      e => e.isFinalBoss &&
      Math.hypot(State.player.x - e.x, State.player.y - e.y) <
        State.player.size * State.player.currentScale + e.size + 10
    );
    State.status = killedByBoss ? 'WIN' : 'GAME_OVER';
    onStateChange(State);
    return;
  }

  // ── 4. Weapons ──────────────────────────────────────────────────────────────
  const totalDmgMult = State.stats.damageMultiplier + extraDamageMult;
  State.unlockedWeapons.forEach(wid => {
    const w = weapons[wid];
    const weaponAttackSpeed = getWeaponAttackSpeedMultiplier(State, wid);
    w.currentCooldown -= dt * State.stats.attackSpeedMultiplier * weaponAttackSpeed;
    if (w.currentCooldown <= 0 && w.baseCooldown > 0) {
      const saved = State.stats.damageMultiplier;
      State.stats.damageMultiplier = totalDmgMult;
      w.fire(State, State.player, State.enemies);
      State.stats.damageMultiplier = saved;
      w.currentCooldown = w.baseCooldown;
    }
  });

  // ── 5. Mini clones ──────────────────────────────────────────────────────────
  for (const clone of State.miniClones) {
    // Find nearest enemy
    let nearest = null, minDistC = Infinity;
    for (const e of State.enemies) {
      const d = Math.hypot(e.x - clone.x, e.y - clone.y);
      if (d < minDistC) { minDistC = d; nearest = e; }
    }

    if (nearest && minDistC > 55) {
      const ang = Math.atan2(nearest.y - clone.y, nearest.x - clone.x);
      clone.vx = Math.cos(ang) * clone.speed;
      clone.vy = Math.sin(ang) * clone.speed;
    } else if (!nearest) {
      const dist = Math.hypot(State.player.x - clone.x, State.player.y - clone.y);
      if (dist > 80) {
        const ang = Math.atan2(State.player.y - clone.y, State.player.x - clone.x);
        clone.vx = Math.cos(ang) * clone.speed;
        clone.vy = Math.sin(ang) * clone.speed;
      } else {
        clone.vx *= 0.8; clone.vy *= 0.8;
      }
    } else {
      clone.vx *= 0.8; clone.vy *= 0.8;
    }

    clone.x += clone.vx * dt;
    clone.y += clone.vy * dt;
    if (clone.vx < -5) clone.facingLeft = true;
    else if (clone.vx > 5) clone.facingLeft = false;

    clone.animTimer += dt;
    if (clone.animTimer >= ANIM_SPEED) { clone.animTimer = 0; clone.animFrame = 1 - clone.animFrame; }

    // Mini clone fires at 25% of player attack speed
    clone.weaponCooldown -= dt * State.stats.attackSpeedMultiplier * 0.25;
    if (clone.weaponCooldown <= 0 && nearest && minDistC < 400) {
      clone.weaponCooldown = 1.2;
      const ang = Math.atan2(nearest.y - clone.y, nearest.x - clone.x);
      const projCount = 1 + State.stats.projectileCountBonus;
      for (let i = 0; i < projCount; i++) {
        const off = projCount > 1 ? (i - (projCount - 1) / 2) * 0.2 : 0;
        State.projectiles.push({
          id: Math.random().toString(),
          x: clone.x, y: clone.y,
          vx: Math.cos(ang + off), vy: Math.sin(ang + off),
          speed: 250,
          size: getWeaponProjectileSize(State, 1),
          damage: 25 * totalDmgMult * 0.25,
          range: 400, distanceTraveled: 0, weaponId: 1, lifeTime: 0,
        });
      }
    }
  }

  // ── 5b. Mini clones are immortal — no damage section ────────────────────────

  // ── 6. Projectiles ──────────────────────────────────────────────────────────
  for (let i = State.projectiles.length - 1; i >= 0; i--) {
    const p = State.projectiles[i];
    p.x += p.vx * p.speed * dt;
    p.y += p.vy * p.speed * dt;
    p.distanceTraveled += p.speed * dt;
    let hit = false;
    for (let j = State.enemies.length - 1; j >= 0; j--) {
      const e = State.enemies[j];
      if (Math.hypot(p.x - e.x, p.y - e.y) < e.size + 6) {
        if (e.isFinalBoss) {
          // Final boss is immortal — projectiles bounce off
          if (Math.random() < 0.25) {
            State.damageTexts.push({ id: Math.random().toString(), x: e.x, y: e.y - 20, text: '✦ IMMORTAL', lifeTime: 0.6, maxLifeTime: 0.6, color: '#ff4488' });
          }
        } else {
          e.currentHP -= p.damage;
          State.damageTexts.push({ id: Math.random().toString(), x: e.x, y: e.y - 20, text: Math.floor(p.damage).toString(), lifeTime: 0.8, maxLifeTime: 0.8, color: '#fff' });
        }
        hit = true; break;
      }
    }
    if (hit || p.distanceTraveled >= p.range) State.projectiles.splice(i, 1);
  }

  // ── 7. Enemy deaths ─────────────────────────────────────────────────────────
  for (let i = State.enemies.length - 1; i >= 0; i--) {
    const e = State.enemies[i];
    if (e.isFinalBoss) continue; // immortal — never dies
    if (e.currentHP <= 0) {
      State.kills++;
      const color = pickOrbColor(e.type);
      const amount = Math.round(e.xp * orbMultiplier(color));
      State.xpOrbs.push({ id: Math.random().toString(), x: e.x, y: e.y, amount, collected: false, targetPlayer: false, color });
      if (e.isBoss) {
        State.chests.push({
          id: 'special_chest_6m',
          x: e.x,
          y: e.y,
          opened: false,
          kind: 'special',
        });
      } else if (Math.random() < 0.01) {
        State.chests.push({
          id: Math.random().toString(),
          x: e.x + (Math.random() - 0.5) * 30,
          y: e.y + (Math.random() - 0.5) * 30,
          opened: false,
          kind: 'normal',
        });
      }
      State.enemies.splice(i, 1);
    }
  }

  // ── 8. Chest pickup ─────────────────────────────────────────────────────────
  for (let i = State.chests.length - 1; i >= 0; i--) {
    const chest = State.chests[i];
    if (!chest.opened && Math.hypot(State.player.x - chest.x, State.player.y - chest.y) < 32) {
      chest.opened = true;
      State.currentChestKind = chest.kind;
      State.chestRewardsRemaining = chest.kind === 'special' ? 3 : 1;
      rollChestReward();
      State.status = 'CHEST';
      onStateChange(State);
      return;
    }
  }

  // ── 9. XP orbs ──────────────────────────────────────────────────────────────
  for (let i = State.xpOrbs.length - 1; i >= 0; i--) {
    const orb = State.xpOrbs[i];
    const dist = Math.hypot(State.player.x - orb.x, State.player.y - orb.y);
    if (dist < orbAttractionRange) orb.targetPlayer = true;
    if (orb.targetPlayer) {
      const ang = Math.atan2(State.player.y - orb.y, State.player.x - orb.x);
      orb.x += Math.cos(ang) * 400 * dt;
      orb.y += Math.sin(ang) * 400 * dt;
      if (dist < 15) { State.xp += orb.amount; State.xpOrbs.splice(i, 1); }
    }
  }

  // ── 10. Apple trees ─────────────────────────────────────────────────────────
  for (const tree of State.appleTrees) {
    if (!tree.hasApple) {
      tree.appleTimer += dt;
      if (tree.appleTimer >= 60) {
        tree.appleTimer = 0;
        tree.hasApple = true;
        State.apples.push({ id: Math.random().toString(), x: tree.x, y: tree.y + 28, treeId: tree.id });
      }
    }
  }
  for (let i = State.apples.length - 1; i >= 0; i--) {
    const apple = State.apples[i];
    if (Math.hypot(State.player.x - apple.x, State.player.y - apple.y) < 28) {
      State.player.currentHP = Math.min(State.player.maxHP, State.player.currentHP + 50);
      State.damageTexts.push({ id: Math.random().toString(), x: apple.x, y: apple.y - 20, text: '+50', lifeTime: 1.2, maxLifeTime: 1.2, color: '#00ff88' });
      const tree = State.appleTrees.find(t => t.id === apple.treeId);
      if (tree) tree.hasApple = false;
      State.apples.splice(i, 1);
    }
  }

  // ── 11. Damage texts ────────────────────────────────────────────────────────
  for (let i = State.damageTexts.length - 1; i >= 0; i--) {
    State.damageTexts[i].lifeTime -= dt;
    if (State.damageTexts[i].lifeTime <= 0) State.damageTexts.splice(i, 1);
  }

  // ── 12. Level up check ──────────────────────────────────────────────────────
  if (State.xp >= State.xpNeeded) {
    State.xp -= State.xpNeeded;
    State.level++;
    State.xpNeeded = getXpRequiredForLevel(State.level);
    State.upgradeChoices = generateUpgrades();
    State.chestReward = null;
    State.status = 'LEVEL_UP';
    onStateChange(State);
  }
}

function rollChestReward() {
  const hasArtifacts = State.remainingArtifactIds.length > 0;
  const giveArtifact = hasArtifacts && Math.random() < 0.4;
  if (giveArtifact) {
    const idx = Math.floor(Math.random() * State.remainingArtifactIds.length);
    const artId = State.remainingArtifactIds.splice(idx, 1)[0];
    State.chestReward = { type: 'artifact', artifact: ALL_ARTIFACTS.find(a => a.id === artId)! };
    State.upgradeChoices = [];
  } else {
    State.chestReward = null;
    State.upgradeChoices = generateUpgrades();
  }
}

export function advanceChestReward(): boolean {
  if (State.chestRewardsRemaining <= 1) {
    State.chestRewardsRemaining = 0;
    State.chestReward = null;
    State.upgradeChoices = [];
    return false;
  }

  State.chestRewardsRemaining--;
  rollChestReward();
  return true;
}

const ABILITY_LABEL_KEYS: Record<string, Parameters<typeof t>[0]> = {
  dmg: 'upgDmg',
  atk_spd: 'upgAtkSpd',
  move_spd: 'upgMoveSpd',
  hp: 'upgHp',
  proj: 'upgProj',
  shrink: 'upgShrink',
  split: 'upgSplit',
  weapon_1: 'weaponBolt',
  weapon_2: 'weaponSpray',
  weapon_3: 'weaponWeb',
  weapon_4: 'weaponFireTrail',
  weapon_5: 'weaponPoisonTrail',
  weapon_6: 'weaponIceTrail',
};

function getAbilityMaxLevel(state: GameState, id: string): number {
  if (id === 'heal') return 1;
  return MAX_UPGRADE_LEVEL + (state.upgradeMaxLevelBonuses[id] ?? 0);
}

function isUpgradeRemoved(state: GameState, id: string): boolean {
  return state.removedUpgradeIds.includes(id);
}

export function getRunAbilityTargets(): AbilityTarget[] {
  const targets: AbilityTarget[] = [];
  const seen = new Set<string>();

  for (const [id, level] of Object.entries(State.upgradeLevels)) {
    if (level <= 0 || id === 'heal' || isUpgradeRemoved(State, id) || !ABILITY_LABEL_KEYS[id]) continue;
    targets.push({
      id,
      label: t(ABILITY_LABEL_KEYS[id]),
      kind: id === 'split' ? 'mini' : 'stat',
      level,
      maxLevel: getAbilityMaxLevel(State, id),
    });
    seen.add(id);
  }

  for (const weaponId of State.unlockedWeapons) {
    const id = `weapon_${weaponId}`;
    if (seen.has(id) || isUpgradeRemoved(State, id)) continue;
    targets.push({
      id,
      label: t(ABILITY_LABEL_KEYS[id]),
      kind: 'weapon',
      level: getWeaponLevel(State, weaponId),
      maxLevel: getAbilityMaxLevel(State, id),
    });
    seen.add(id);
  }

  return targets;
}

export function canUseRemovalAction(): boolean {
  return !State.removalActionUsed && getRunAbilityTargets().length >= 2;
}

export function removeAbilityFromRun(id: string): boolean {
  const target = getRunAbilityTargets().find(ability => ability.id === id);
  if (!target || id === 'heal' || State.removedUpgradeIds.includes(id)) return false;

  State.removedUpgradeIds.push(id);
  if (id.startsWith('weapon_')) {
    const weaponId = Number(id.slice('weapon_'.length));
    State.unlockedWeapons = State.unlockedWeapons.filter(value => value !== weaponId);
    delete State.weaponLevels[weaponId];
  }
  return true;
}

export function increaseAbilityMaxLevel(id: string): boolean {
  const target = getRunAbilityTargets().find(ability => ability.id === id);
  if (!target || id === 'heal' || State.removalActionUsed) return false;

  State.upgradeMaxLevelBonuses[id] = (State.upgradeMaxLevelBonuses[id] ?? 0) + 5;
  State.removalActionUsed = true;
  return true;
}

// ── Upgrade pool ─────────────────────────────────────────────────────────────
function createUpgrade(
  state: GameState,
  id: string,
  kind: UpgradeOptions['kind'],
  labelKey: Parameters<typeof t>[0],
  apply: (state: GameState) => void,
): UpgradeOptions | null {
  if (isUpgradeRemoved(state, id)) return null;
  const level = (state.upgradeLevels[id] ?? 0) + 1;
  const maxLevel = getAbilityMaxLevel(state, id);
  if (level > maxLevel) return null;
  return {
    id,
    kind,
    level,
    maxLevel,
    label: t(labelKey),
    apply: s => {
      apply(s);
      s.upgradeLevels[id] = level;
    },
  };
}

function createWeaponUpgrade(state: GameState, weaponId: number, labelKey: Parameters<typeof t>[0]): UpgradeOptions | null {
  const id = `weapon_${weaponId}`;
  if (isUpgradeRemoved(state, id)) return null;
  const level = getWeaponLevel(state, weaponId) + 1;
  const maxLevel = getAbilityMaxLevel(state, id);
  if (level > maxLevel) return null;
  return {
    id,
    kind: 'weapon',
    level,
    maxLevel,
    label: t(labelKey),
    apply: s => { s.weaponLevels[weaponId] = level; },
  };
}

function generateUpgrades(): UpgradeOptions[] {
  const pool: UpgradeOptions[] = [];
  const add = (
    id: string,
    kind: UpgradeOptions['kind'],
    labelKey: Parameters<typeof t>[0],
    apply: (state: GameState) => void,
  ) => {
    const upgrade = createUpgrade(State, id, kind, labelKey, apply);
    if (upgrade) pool.push(upgrade);
  };

  add('dmg', 'stat', 'upgDmg', s => { s.stats.damageMultiplier += 0.2; });
  add('atk_spd', 'stat', 'upgAtkSpd', s => { s.stats.attackSpeedMultiplier += 0.2; });
  add('move_spd', 'stat', 'upgMoveSpd', s => { s.stats.moveSpeedMultiplier += 0.15; });
  add('hp', 'stat', 'upgHp', s => { s.player.baseMaxHP += 50; s.player.maxHP += 50; s.player.currentHP += 50; });
  add('proj', 'stat', 'upgProj', s => { s.stats.projectileCountBonus += 1; });
  add('shrink', 'stat', 'upgShrink', s => {
      const newBase = Math.max(50, s.player.baseMaxHP - 50);
      const diff = s.player.baseMaxHP - newBase;
      s.player.baseMaxHP = newBase;
      s.player.maxHP = Math.max(10, s.player.maxHP - diff);
      s.player.currentHP = Math.min(s.player.currentHP, s.player.maxHP);
    });
  add('split', 'mini', 'upgSplit', s => {
      s.player.currentHP = Math.max(1, s.player.currentHP * 0.75);
      const angle = (s.miniClones.length * Math.PI * 0.4) + Math.random() * 0.5;
      const clone: MiniClone = {
        id: Math.random().toString(),
        x: s.player.x + Math.cos(angle) * 70,
        y: s.player.y + Math.sin(angle) * 70,
        heroType: s.player.heroType,
        maxHP: s.player.maxHP * 0.25,
        currentHP: s.player.maxHP * 0.25,
        size: Math.max(6, s.player.size * 0.5),
        speed: s.player.speed,
        vx: 0, vy: 0,
        animFrame: 0, animTimer: 0, facingLeft: false,
        weaponCooldown: 0,
      };
      s.miniClones.push(clone);
    });

  if (!State.unlockedWeapons.includes(2) && !isUpgradeRemoved(State, 'weapon_2') && State.level >= 5)
    pool.push({
      id: 'weapon_2', kind: 'weapon', level: 1, maxLevel: getAbilityMaxLevel(State, 'weapon_2'), label: t('upgSlimeSpray'),
      apply: s => { s.unlockedWeapons.push(2); s.weaponLevels[2] = 1; },
    });
  if (!State.unlockedWeapons.includes(3) && !isUpgradeRemoved(State, 'weapon_3') && State.level >= 10)
    pool.push({
      id: 'weapon_3', kind: 'weapon', level: 1, maxLevel: getAbilityMaxLevel(State, 'weapon_3'), label: t('upgStickyWeb'),
      apply: s => { s.unlockedWeapons.push(3); s.weaponLevels[3] = 1; },
    });

  for (const [weaponId, labelKey] of [[1, 'weaponBolt'], [2, 'weaponSpray'], [3, 'weaponWeb']] as const) {
    if (State.unlockedWeapons.includes(weaponId)) {
      const upgrade = createWeaponUpgrade(State, weaponId, labelKey);
      if (upgrade) pool.push(upgrade);
    }
  }

  const activeTrailWeapon = getTrailWeaponId(State);
  if (activeTrailWeapon) {
    const trailLabelKeys = {
      4: 'weaponFireTrail',
      5: 'weaponPoisonTrail',
      6: 'weaponIceTrail',
    } as const;
    const upgrade = createWeaponUpgrade(State, activeTrailWeapon, trailLabelKeys[activeTrailWeapon]);
    if (upgrade) pool.push(upgrade);
  } else if (State.level >= 5) {
    const trailUnlocks = [
      [4, 'upgFireTrail'],
      [5, 'upgPoisonTrail'],
      [6, 'upgIceTrail'],
    ] as const;
    for (const [weaponId, labelKey] of trailUnlocks) {
      if (!isUpgradeRemoved(State, `weapon_${weaponId}`)) {
        pool.push({
          id: `weapon_${weaponId}`,
          kind: 'weapon',
          level: 1,
          maxLevel: getAbilityMaxLevel(State, `weapon_${weaponId}`),
          label: t(labelKey),
          apply: s => {
            if (!s.unlockedWeapons.some(id => id >= 4 && id <= 6)) {
              s.unlockedWeapons.push(weaponId);
              s.weaponLevels[weaponId] = 1;
            }
          },
        });
      }
    }
  }

  if (pool.length === 0) {
    return [{
      id: 'heal',
      kind: 'stat',
      level: 1,
      maxLevel: 1,
      label: t('upgHeal'),
      apply: s => {
        const healed = Math.min(50, s.player.maxHP - s.player.currentHP);
        s.player.currentHP = Math.min(s.player.maxHP, s.player.currentHP + 50);
        s.damageTexts.push({
          id: Math.random().toString(),
          x: s.player.x,
          y: s.player.y - 20,
          text: `+${Math.round(healed)} HP`,
          lifeTime: 1.2,
          maxLifeTime: 1.2,
          color: '#00ff88',
        });
      },
    }];
  }

  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}
