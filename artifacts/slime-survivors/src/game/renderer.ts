import { GameState } from './state';
import { Lake } from './entities';
import { t } from './lang';
import { sp } from './sprites';
import { TILE_SIZE } from './world';
import { heroColor } from './gameLoop';

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
) {
  const img = sp(key);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (flipH) ctx.scale(-1, 1);
  if (img) {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
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

      if      (top    && left)  drawTile(ctx, 'water_corner', px, py,  Math.PI,      false, false); // NW
      else if (top    && right) drawTile(ctx, 'water_corner', px, py, -Math.PI / 2,  false, false); // NE
      else if (bottom && left)  drawTile(ctx, 'water_corner', px, py,  Math.PI / 2,  false, false); // SW
      else if (bottom && right) drawTile(ctx, 'water_corner', px, py,  0,            false, false); // SE
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

  ctx.save();
  ctx.translate(-state.camera.x + width / 2 + sx, -state.camera.y + height / 2 + sy);

  // ── 1. Grass tiles ──────────────────────────────────────────────────────────
  const S = TILE_SIZE;
  const startCol = Math.floor((state.camera.x - width / 2) / S) - 1;
  const endCol   = startCol + Math.ceil(width / S) + 2;
  const startRow = Math.floor((state.camera.y - height / 2) / S) - 1;
  const endRow   = startRow + Math.ceil(height / S) + 2;
  const grassImg = sp('grass');

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
    }
  }

  // ── 2. Lakes ────────────────────────────────────────────────────────────────
  for (const lake of state.lakes) {
    if (
      lake.x + lake.widthTiles * S  < state.camera.x - width / 2  ||
      lake.x                        > state.camera.x + width / 2  ||
      lake.y + lake.heightTiles * S < state.camera.y - height / 2 ||
      lake.y                        > state.camera.y + height / 2
    ) continue;
    renderLake(ctx, lake);
  }

  // ── 3. Apple trees ──────────────────────────────────────────────────────────
  for (const tree of state.appleTrees) {
    const inView = Math.abs(tree.x - state.camera.x) < width / 2 + 100 &&
                   Math.abs(tree.y - state.camera.y) < height / 2 + 100;
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

  // ── 4. Apples on ground ─────────────────────────────────────────────────────
  for (const apple of state.apples) {
    drawSprite(ctx, 'apple', apple.x, apple.y + Math.sin(Date.now() / 500) * 3, 22, 22);
  }

  // ── 5. Sticky Web aura ──────────────────────────────────────────────────────
  if (state.unlockedWeapons.includes(3)) {
    ctx.fillStyle = 'rgba(50, 200, 50, 0.10)';
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(50, 200, 50, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── 6. Chests ───────────────────────────────────────────────────────────────
  for (const chest of state.chests) {
    if (chest.opened) continue;
    const inView = Math.abs(chest.x - state.camera.x) < width / 2 + 60 &&
                   Math.abs(chest.y - state.camera.y) < height / 2 + 60;
    if (!inView) continue;
    ctx.save();
    ctx.translate(chest.x, chest.y);
    ctx.fillStyle = '#8B6914'; ctx.fillRect(-16, -10, 32, 22);
    ctx.fillStyle = '#C8960A'; ctx.fillRect(-16, -18, 32, 12);
    ctx.fillStyle = '#FFD700'; ctx.fillRect(-4, -13, 8, 8);
    ctx.strokeStyle = '#5a3a00'; ctx.lineWidth = 2;
    ctx.strokeRect(-16, -18, 32, 12);
    ctx.strokeRect(-16, -10, 32, 22);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('✦', 0, -24);
    ctx.restore();
  }

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
    const inView = Math.abs(enemy.x - state.camera.x) < width / 2 + 120 &&
                   Math.abs(enemy.y - state.camera.y) < height / 2 + 120;
    if (!inView) continue;

    if (enemy.isBoss) {
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
      ctx.restore();
      continue;
    }

    const sprKey = `${enemy.type}${enemy.animFrame + 1}`;
    const sizes: Record<string, number> = { bat: 40, goblin: 52, skeleton: 52, ogre: 64 };
    const drawS = sizes[enemy.type] ?? 48;
    drawSprite(ctx, sprKey, enemy.x, enemy.y, drawS, drawS, enemy.facingLeft);

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
    const inView = Math.abs(clone.x - state.camera.x) < width / 2 + 60 &&
                   Math.abs(clone.y - state.camera.y) < height / 2 + 60;
    if (!inView) continue;
    const miniKey = `slime_mini_${clone.heroType}`;
    drawSprite(ctx, miniKey, clone.x, clone.y, 28, 28, clone.facingLeft);
    // HP bar
    const hpPct = Math.max(0, clone.currentHP / clone.maxHP);
    ctx.fillStyle = '#550000'; ctx.fillRect(clone.x - 12, clone.y - 20, 24, 4);
    ctx.fillStyle = '#00ff88'; ctx.fillRect(clone.x - 12, clone.y - 20, 24 * hpPct, 4);
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
  drawSprite(ctx, sprKey, player.x, player.y, drawW, drawH, player.facingLeft, alpha);

  if (player.currentHP < player.maxHP || state.invincibilityTimer > 0) {
    const hpW = 50;
    const hpY = player.y - drawH / 2 - 14;
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
    ctx.arc(proj.x, proj.y, 6, 0, Math.PI * 2);
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
