import { GameState } from './state';
import { Lake } from './entities';
import { t } from './lang';
import { sp } from './sprites';
import { TILE_SIZE } from './world';
import { heroColor } from './gameLoop';
import { getStickyWebRadius, getTrailWeaponId, getTrailWidth } from './upgradeMath';

const BASE_MAX_HP = 100;

// ── Tile drawing helper ──────────────────────────────────────────────────────
function drawTile(
  ctx: CanvasRenderingContext2D,
  key: string,
  px: number, py: number,
  rotRad = 0,
  flipH = false,
  flipV = false,
) {
  const img = sp(key);
  const S = TILE_SIZE;
  ctx.save();
  ctx.translate(px + S / 2, py + S / 2);
  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);
  if (rotRad) ctx.rotate(rotRad);
  if (img) {
    ctx.drawImage(img, -S / 2, -S / 2, S, S);
  } else {
    ctx.fillStyle = '#1a90aa';
    ctx.fillRect(-S / 2, -S / 2, S, S);
  }
  ctx.restore();
}

// ── Sprite drawing helper ────────────────────────────────────────────────────
function drawSprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number, cy: number,
  w: number, h: number,
  flipH = false,
  alpha = 1.0,
  cropSlime = false,
) {
  const img = sp(key);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (flipH) ctx.scale(-1, 1);
  if (img) {
    if (cropSlime) {
      // Slime PNGs have transparent padding around the actual pixel art.
      // Draw only the art bounds so mobile zoom does not make the character
      // look like a tiny, compressed texture.
      const mini = key.startsWith('slime_mini_');
      const source = mini
        ? { x: 2, y: 6, width: 27, height: 22 }
        : { x: 4, y: 14, width: 55, height: 46 };
      const sourceAspect = source.width / source.height;
      const targetAspect = w / h;
      const drawW = targetAspect > sourceAspect ? h * sourceAspect : w;
      const drawH = targetAspect > sourceAspect ? h : w / sourceAspect;
      ctx.drawImage(
        img,
        source.x, source.y, source.width, source.height,
        -drawW / 2, -drawH / 2, drawW, drawH,
      );
    } else {
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  } else {
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

function drawEffectStamp(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  cy: number,
  size: number,
  alpha: number,
) {
  const img = sp(key);
  if (!img) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

function drawRotatedSprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  cx: number,
  cy: number,
  size: number,
  rotation: number,
) {
  const img = sp(key);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  }
  ctx.restore();
}

function trailPalette(weaponId: number) {
  if (weaponId === 4) return { base: '#b82d24', glow: '#ef5b2a', spark: '#ffb347', sprite: 'effect_fire' };
  if (weaponId === 5) return { base: '#258541', glow: '#54d957', spark: '#a8ff75', sprite: 'effect_poison' };
  return { base: '#2465ad', glow: '#45b9ef', spark: '#bdefff', sprite: 'effect_ice' };
}

function renderTrail(ctx: CanvasRenderingContext2D, state: GameState) {
  const weaponId = getTrailWeaponId(state);
  if (!weaponId || state.trailSegments.length === 0) return;
  const palette = trailPalette(weaponId);
  const width = getTrailWidth(state, weaponId);
  // Avoid spending a frame on stale trail points after a long movement burst.
  const points = state.trailSegments.slice(-72);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Wider and denser than the previous version, but still a compact trail.
  ctx.globalAlpha = 0.52;
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = Math.max(4, width * 0.42);
  ctx.beginPath();
  points.forEach((segment, index) => {
    if (index === 0) ctx.moveTo(segment.x, segment.y);
    else ctx.lineTo(segment.x, segment.y);
  });
  ctx.stroke();

  for (let index = 0; index < points.length; index++) {
    const segment = points[index];
    const alpha = Math.max(0.24, 1 - segment.age / segment.maxAge);
    const stampRadius = Math.max(3.5, width * 0.3);
    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = palette.base;
    ctx.beginPath();
    ctx.arc(segment.x, segment.y, stampRadius, 0, Math.PI * 2);
    ctx.fill();

    // Static pixel-art stamps are cheaper than animated particles and remain
    // visible on the road even on slower mobile devices.
    const effectSize = Math.max(12, Math.min(19, width * 0.82));
    drawEffectStamp(ctx, palette.sprite, segment.x, segment.y, effectSize, alpha);
  }
  ctx.restore();
}

function renderEnemyStatusFx(ctx: CanvasRenderingContext2D, enemy: GameState['enemies'][number]) {
  if (enemy.burningTimer > 0) {
    ctx.save();
    const fireOffsets = [
      [-0.7, -0.9],
      [0, -1.25],
      [0.7, -0.9],
    ];
    for (const [ox, oy] of fireOffsets) {
      drawEffectStamp(ctx, 'effect_fire', enemy.x + ox * enemy.size, enemy.y + oy * enemy.size, 18, 0.95);
    }
    ctx.restore();
  }
  if (enemy.poisoned) {
    ctx.save();
    const poisonOffsets = [
      [-0.85, -0.35],
      [0, -1.0],
      [0.85, -0.35],
    ];
    for (const [ox, oy] of poisonOffsets) {
      drawEffectStamp(ctx, 'effect_poison', enemy.x + ox * enemy.size, enemy.y + oy * enemy.size, 18, 0.9);
    }
    ctx.restore();
  }
  if (enemy.frozenTimer > 0 || enemy.chilledTimer > 0) {
    ctx.save();
    ctx.strokeStyle = enemy.frozenTimer > 0 ? '#b9f2ff' : '#5bbcff';
    ctx.fillStyle = enemy.frozenTimer > 0 ? 'rgba(170,235,255,0.22)' : 'rgba(80,170,255,0.12)';
    ctx.lineWidth = enemy.frozenTimer > 0 ? 3 : 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.size + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const iceRadius = enemy.size * 0.95;
    const iceOffsets = [
      [-1, 0], [-0.5, -0.9], [0.5, -0.9],
      [1, 0], [0.5, 0.9], [-0.5, 0.9],
    ];
    for (const [ox, oy] of iceOffsets) {
      drawEffectStamp(ctx, 'effect_ice', enemy.x + ox * iceRadius, enemy.y + oy * iceRadius, 18, 0.95);
    }
    ctx.restore();
  }
}

function renderChestNavigation(ctx: CanvasRenderingContext2D, state: GameState) {
  const target = state.chests
    .filter(chest => !chest.opened)
    .sort((a, b) =>
      Math.hypot(a.x - state.player.x, a.y - state.player.y) -
      Math.hypot(b.x - state.player.x, b.y - state.player.y),
    )[0];
  if (!target) return;

  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  const distance = Math.hypot(dx, dy);
  const chestRadius = TILE_SIZE * 10;
  const time = Date.now();

  if (distance > chestRadius) {
    // The direction is intentionally shown without a line: the arrow itself
    // points along the invisible route to the nearest unopened chest.
    const angle = Math.atan2(dy, dx);
    const wobble = Math.sin(time / 180) * 0.18;
    const bob = Math.sin(time / 220) * 4;
    const arrowX = state.player.x;
    const arrowY = state.player.y - 58 + bob;
    drawRotatedSprite(ctx, 'chest_arrow', arrowX, arrowY, 38, angle + Math.PI / 2 + Math.PI + wobble);
  } else {
    // Once the chest is close, keep the pointer anchored above it instead of
    // rotating it around the player.
    const bob = Math.sin(time / 260) * 3;
    drawRotatedSprite(ctx, 'chest_arrow', target.x, target.y - 50 + bob, 38, 0);
  }
}

// ── Lake tile renderer ───────────────────────────────────────────────────────
// water_corner base orientation: grass at SW (bottom-left)
// water_side   base orientation: grass at W (left)
//
// For canvas rotate(θ): positive = CW. A point at bottom-left (SW) after 90°CW goes to top-left (NW).
// Rotation table (base SW):
//   rotate(0)      → grass at SW  → bottom-left corner
//   rotate(PI/2)   → grass at NW  → top-left corner
//   rotate(PI)     → grass at NE  → top-right corner
//   rotate(-PI/2)  → grass at SE  → bottom-right corner
//
// water_side rotation (base W):
//   rotate(0)      → grass at W   → left edge
//   rotate(PI)     → grass at E   → right edge
//   rotate(PI/2)   → grass at N   → top edge   (left→top after CW)
//   rotate(-PI/2)  → grass at S   → bottom edge (left→bottom after CCW)
function renderLake(ctx: CanvasRenderingContext2D, lake: Lake) {
  const W = lake.widthTiles, H = lake.heightTiles;
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const px = lake.x + gx * TILE_SIZE;
      const py = lake.y + gy * TILE_SIZE;
      const top = gy === 0, bottom = gy === H - 1;
      const left = gx === 0, right = gx === W - 1;

      if      (top    && left)  drawTile(ctx, 'water_corner', px, py,  0,            false, false); // NW
      else if (top    && right) drawTile(ctx, 'water_corner', px, py,  Math.PI / 2,  false, false); // NE
      else if (bottom && left)  drawTile(ctx, 'water_corner', px, py, -Math.PI / 2,  false, false); // SW
      else if (bottom && right) drawTile(ctx, 'water_corner', px, py,  Math.PI,      false, false); // SE
      else if (left)   drawTile(ctx, 'water_side', px, py,  0,             false, false); // W
      else if (right)  drawTile(ctx, 'water_side', px, py,  Math.PI,       false, false); // E
      else if (top)    drawTile(ctx, 'water_side', px, py,  Math.PI / 2,   false, false); // N
      else if (bottom) drawTile(ctx, 'water_side', px, py, -Math.PI / 2,   false, false); // S
      else             drawTile(ctx, 'water', px, py);
    }
  }
}

// ── Main render ──────────────────────────────────────────────────────────────
export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
) {
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#3d6b4a';
  ctx.fillRect(0, 0, width, height);

  let sx = 0, sy = 0;
  if (state.shakeTime > 0) {
    sx = (Math.random() - 0.5) * 8;
    sy = (Math.random() - 0.5) * 8;
  }

  // ── Mobile zoom-out ─────────────────────────────────────────────────────────
  // On narrow screens show more world; caps at 1.0 on desktop
  const zoom = Math.min(1.0, width / 520);

  ctx.save();
  ctx.translate(width / 2 + sx, height / 2 + sy);
  ctx.scale(zoom, zoom);
  ctx.translate(-state.camera.x, -state.camera.y);

  // ── 1. Grass tiles + flowers ─────────────────────────────────────────────────
  const S = TILE_SIZE;
  const halfW = width  / (2 * zoom);
  const halfH = height / (2 * zoom);
  // Keep nearby scenery rendered beyond the visible edge so it does not pop
  // out while the camera moves, especially on the zoomed-out mobile view.
  const objectCullPadding = S * 10;
  const startCol = Math.floor((state.camera.x - halfW) / S) - 1;
  const endCol   = startCol + Math.ceil(width  / (S * zoom)) + 2;
  const startRow = Math.floor((state.camera.y - halfH) / S) - 1;
  const endRow   = startRow + Math.ceil(height / (S * zoom)) + 2;
  const grassImg  = sp('grass');
  const flowerImgs = [sp('flower1'), sp('flower2'), sp('flower3')];

  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      if (grassImg) {
        ctx.drawImage(grassImg, c * S, r * S, S, S);
      } else {
        const seed = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
        const rand = seed - Math.floor(seed);
        ctx.fillStyle = rand < 0.3 ? '#4a7c59' : rand < 0.6 ? '#3d6b4a' : '#5a8c69';
        ctx.fillRect(c * S, r * S, S, S);
      }

      // Deterministic flower decoration (~2.5% of tiles get a flower)
      const h = Math.sin(c * 127.1 + r * 311.7) * 43758.5453;
      const hf = h - Math.floor(h);
      if (hf < 0.025) {
        const fi = Math.floor(hf * 33.3) % 3; // 0,1,2
        const img = flowerImgs[fi];
        if (img) ctx.drawImage(img, c * S, r * S, S, S);
      }
    }
  }

  // ── 2. Lakes ────────────────────────────────────────────────────────────────
  for (const lake of state.lakes) {
    if (
      lake.x + lake.widthTiles * S  < state.camera.x - halfW - objectCullPadding ||
      lake.x                        > state.camera.x + halfW + objectCullPadding ||
      lake.y + lake.heightTiles * S < state.camera.y - halfH - objectCullPadding ||
      lake.y                        > state.camera.y + halfH + objectCullPadding
    ) continue;
    renderLake(ctx, lake);
  }

  // ── 3. Apple trees ──────────────────────────────────────────────────────────
  for (const tree of state.appleTrees) {
    const inView = Math.abs(tree.x - state.camera.x) < halfW + objectCullPadding &&
                   Math.abs(tree.y - state.camera.y) < halfH + objectCullPadding;
    if (!inView) continue;
    drawSprite(ctx, 'apple_tree', tree.x, tree.y - 20, 80, 80);
    if (!tree.hasApple && tree.appleTimer > 0) {
      const pct = tree.appleTimer / 60;
      ctx.save();
      ctx.translate(tree.x, tree.y - 56);
      ctx.strokeStyle = '#88ff88';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── 3b. Elemental trail ─────────────────────────────────────────────────────
  renderTrail(ctx, state);

  // ── 4. Apples on ground ─────────────────────────────────────────────────────
  for (const apple of state.apples) {
    drawSprite(ctx, 'apple', apple.x, apple.y + Math.sin(Date.now() / 500) * 3, 22, 22);
  }

  // ── 5. Sticky Web aura ──────────────────────────────────────────────────────
  if (state.unlockedWeapons.includes(3)) {
    ctx.fillStyle = 'rgba(50, 200, 50, 0.10)';
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, getStickyWebRadius(state), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50, 200, 50, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── 6. Chests ───────────────────────────────────────────────────────────────
  for (const chest of state.chests) {
    if (chest.opened) continue;
    const inView = Math.abs(chest.x - state.camera.x) < halfW + objectCullPadding &&
                   Math.abs(chest.y - state.camera.y) < halfH + objectCullPadding;
    if (!inView) continue;
    const chestSize = chest.kind === 'special' ? 70 : 54;
    drawSprite(ctx, chest.kind === 'special' ? 'chest_special' : 'chest', chest.x, chest.y, chestSize, chestSize);
  }
  renderChestNavigation(ctx, state);

  // ── 7. XP Orbs ──────────────────────────────────────────────────────────────
  for (const orb of state.xpOrbs) {
    ctx.save();
    ctx.translate(orb.x, orb.y);
    const orbColors = { orange: '#ffcc00', green: '#44ff88', purple: '#cc44ff' };
    const orbGlow   = { orange: '#ddaa00', green: '#22cc66', purple: '#8822cc' };
    ctx.fillStyle = orbColors[orb.color];
    ctx.beginPath();
    ctx.arc(0, 0, orb.color === 'purple' ? 6 : orb.color === 'green' ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = orbGlow[orb.color];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ── 8. Enemies ──────────────────────────────────────────────────────────────
  for (const enemy of state.enemies) {
    const inView = Math.abs(enemy.x - state.camera.x) < halfW + objectCullPadding &&
                   Math.abs(enemy.y - state.camera.y) < halfH + objectCullPadding;
    if (!inView) continue;

    if (enemy.isBoss && !enemy.isFinalBoss) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 220);
      ctx.save();
      ctx.shadowColor = '#ffbb22';
      ctx.shadowBlur = 24 * pulse;
      ctx.globalAlpha = 0.3 * pulse;
      ctx.fillStyle = '#ffbb22';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      drawSprite(ctx, `skeleton_boss${enemy.animFrame + 1}`, enemy.x, enemy.y, 76, 76, enemy.facingLeft);
      ctx.font = 'bold 16px "Courier New",monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffcc44';
      ctx.fillText('☠', enemy.x, enemy.y - 52);
      const bossBarW = 72;
      const bossBarY = enemy.y - 45;
      ctx.fillStyle = '#330000';
      ctx.fillRect(enemy.x - bossBarW / 2, bossBarY, bossBarW, 6);
      ctx.fillStyle = '#ff3344';
      ctx.fillRect(enemy.x - bossBarW / 2, bossBarY, bossBarW * Math.max(0, enemy.currentHP / enemy.maxHP), 6);
      renderEnemyStatusFx(ctx, enemy);
      ctx.restore();
      continue;
    }

    if (enemy.isFinalBoss) {
      // Boss bat — pulsing red glow + large sprite
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200);
      ctx.save();
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 40 * pulse;
      ctx.globalAlpha = 0.35 * pulse;
      ctx.fillStyle = '#ff0033';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 66, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      drawSprite(ctx, `bat${enemy.animFrame + 1}`, enemy.x, enemy.y, 80, 80, enemy.facingLeft);
      // Blood-red tint overlay
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#ff0033';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // Skull icon above
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff2244';
      ctx.fillText('☠️', enemy.x, enemy.y - 58);
      renderEnemyStatusFx(ctx, enemy);
      ctx.restore();
      continue;
    }

    const sprKey = `${enemy.type}${enemy.animFrame + 1}`;
    const sizes: Record<string, number> = { bat: 40, goblin: 52, skeleton: 52, ogre: 64 };
    const drawS = sizes[enemy.type] ?? 48;
    drawSprite(ctx, sprKey, enemy.x, enemy.y, drawS, drawS, enemy.facingLeft);
    renderEnemyStatusFx(ctx, enemy);

    if (enemy.currentHP < enemy.maxHP) {
      const bw = enemy.size * 2 + 4;
      const bx = enemy.x - bw / 2;
      const by = enemy.y - enemy.size - 14;
      ctx.fillStyle = '#550000'; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = '#ff3333';
      ctx.fillRect(bx, by, bw * Math.max(0, enemy.currentHP / enemy.maxHP), 5);
    }
    if (enemy.slowed) {
      ctx.strokeStyle = 'rgba(50,200,50,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.size + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── 9. Mini clones ──────────────────────────────────────────────────────────
  for (const clone of state.miniClones) {
    const inView = Math.abs(clone.x - state.camera.x) < halfW + objectCullPadding &&
                   Math.abs(clone.y - state.camera.y) < halfH + objectCullPadding;
    if (!inView) continue;
    const miniKey = `slime_mini_${clone.heroType}`;
    drawSprite(ctx, miniKey, clone.x, clone.y, 28 / zoom, 28 / zoom, clone.facingLeft, 1, true);
  }

  // ── 10. Player ──────────────────────────────────────────────────────────────
  const { player } = state;

  // Capped visual size: linear beyond 100 HP but with cap
  const drawW = Math.round(Math.min(110, 48 + (player.baseMaxHP - BASE_MAX_HP) * 0.05) * player.currentScale);
  const drawH = drawW;

  const flashing = state.invincibilityTimer > 0 && Math.floor(state.invincibilityTimer * 10) % 2 === 0;
  const alpha = flashing ? 0.3 : 1.0;

  if (player.lakeBuffTimer > 0) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.beginPath();
    ctx.arc(0, 0, drawW / 2 + 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100,200,255,0.3)';
    ctx.fill();
    ctx.restore();
  }

  const heroType = player.heroType;
  const sprKey = heroType === 'green'  ? `slime_green${player.animFrame + 1}` :
                 heroType === 'purple' ? `slime_purple${player.animFrame + 1}` :
                                         `slime${player.animFrame + 1}`;
  const slimeDrawW = drawW / zoom;
  const slimeDrawH = drawH / zoom;
  drawSprite(ctx, sprKey, player.x, player.y, slimeDrawW, slimeDrawH, player.facingLeft, alpha, true);

  if (player.currentHP < player.maxHP || state.invincibilityTimer > 0) {
    const hpW = 50;
    const hpY = player.y - slimeDrawH / 2 - 14;
    ctx.fillStyle = '#550000'; ctx.fillRect(player.x - hpW / 2, hpY, hpW, 7);
    const pct = Math.max(0, player.currentHP / player.maxHP);
    ctx.fillStyle = pct > 0.5 ? '#00ff00' : pct > 0.25 ? '#ffff00' : '#ff0000';
    ctx.fillRect(player.x - hpW / 2, hpY, hpW * pct, 7);
  }

  // ── 11. Projectiles ─────────────────────────────────────────────────────────
  const pColor = heroColor(player.heroType);
  for (const proj of state.projectiles) {
    ctx.fillStyle = pColor;
    ctx.beginPath();
     ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── 12. Damage texts ────────────────────────────────────────────────────────
  for (const dt of state.damageTexts) {
    ctx.globalAlpha = dt.lifeTime / dt.maxLifeTime;
    ctx.fillStyle = dt.color;
    ctx.font = 'bold 16px "Courier New",monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dt.text, dt.x, dt.y - (dt.maxLifeTime - dt.lifeTime) * 40);
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();

  // ── HUD (screen space) ──────────────────────────────────────────────────────
  if (state.status === 'PLAYING' || state.status === 'PAUSED') {
    ctx.textBaseline = 'top';

    const mins = Math.floor(state.timeSurvived / 60);
    const secs = Math.floor(state.timeSurvived % 60);
    ctx.font = 'bold 20px "Courier New",monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(10, 10, 100, 30);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText(`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`, 16, 14);

    if (state.player.lakeBuffTimer > 0) {
      ctx.font = 'bold 13px "Courier New",monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, 46, 170, 22);
      ctx.fillStyle = '#66ccff';
      ctx.fillText(`${t('lakeBuff')}: ${Math.ceil(state.player.lakeBuffTimer)}s`, 14, 50);
    }

    ctx.font = 'bold 20px "Courier New",monospace';
    ctx.textAlign = 'right';
    const killsText = `${t('kills')}: ${state.kills}`;
    const kw = ctx.measureText(killsText).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(width - kw - 10, 10, kw, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(killsText, width - 16, 14);

    const barW = Math.min(width * 0.55, 360);
    const barX = (width - barW) / 2;
    const barY = height - 48;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 4, barY - 26, barW + 8, 52);
    ctx.font = 'bold 14px "Courier New",monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${t('levelLabel')} ${state.level}`, width / 2, barY - 22);
    ctx.fillStyle = '#222';
    ctx.fillRect(barX, barY, barW, 16);
    ctx.fillStyle = '#00aaff';
    ctx.fillRect(barX, barY, barW * (state.xp / state.xpNeeded), 16);
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, 16);

    if (state.invincibilityTimer > 0) {
      ctx.font = 'bold 13px "Courier New",monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,220,100,0.9)';
      ctx.fillText(`✨ ${Math.ceil(state.invincibilityTimer)}s`, width / 2, barY - 44);
    }

    // Mini clone indicator
    if (state.miniClones.length > 0) {
      ctx.font = 'bold 12px "Courier New",monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, 74, 130, 20);
      ctx.fillStyle = '#aaffcc';
      ctx.fillText(`⚡ ${t('miniClone')} ×${state.miniClones.length}`, 14, 77);
    }
  }
}
