import { Lake, DesertBiome, AppleTree } from './entities';

export const TILE_SIZE = 32;

function rectanglesOverlap(
  a: { x: number; y: number; widthTiles: number; heightTiles: number },
  b: { x: number; y: number; widthTiles: number; heightTiles: number },
  gapTiles = 0,
) {
  const gap = gapTiles * TILE_SIZE;
  return !(
    a.x + a.widthTiles * TILE_SIZE + gap <= b.x ||
    b.x + b.widthTiles * TILE_SIZE + gap <= a.x ||
    a.y + a.heightTiles * TILE_SIZE + gap <= b.y ||
    b.y + b.heightTiles * TILE_SIZE + gap <= a.y
  );
}

/** Returns true if two lakes overlap or are closer than minGap pixels apart. */
function lakesTooClose(a: Lake, b: Lake, minGap = TILE_SIZE * 3): boolean {
  return !(
    a.x + a.widthTiles  * TILE_SIZE + minGap < b.x ||
    b.x + b.widthTiles  * TILE_SIZE + minGap < a.x ||
    a.y + a.heightTiles * TILE_SIZE + minGap < b.y ||
    b.y + b.heightTiles * TILE_SIZE + minGap < a.y
  );
}

export function generateLakes(count: number): Lake[] {
  const lakes: Lake[] = [];
  let attempts = 0;
  while (lakes.length < count && attempts < count * 30) {
    attempts++;
    const widthTiles  = 5 + Math.floor(Math.random() * 11); // 5-15
    const heightTiles = 5 + Math.floor(Math.random() * 11); // 5-15
    // Spread over a large area; store top-left corner
    const cx = (Math.random() - 0.5) * 5000;
    const cy = (Math.random() - 0.5) * 5000;
    const candidate: Lake = {
      id: String(lakes.length),
      x: Math.round((cx - (widthTiles * TILE_SIZE) / 2) / TILE_SIZE) * TILE_SIZE,
      y: Math.round((cy - (heightTiles * TILE_SIZE) / 2) / TILE_SIZE) * TILE_SIZE,
      widthTiles,
      heightTiles,
      seed: Math.random() * 1000,
    };
    // Keep away from spawn area
    if (Math.hypot(cx, cy) < 400) continue;
    // Reject if too close to any existing lake
    if (lakes.some(l => lakesTooClose(l, candidate))) continue;
    lakes.push(candidate);
  }
  return lakes;
}

/** AABB check — is the pixel point inside any lake? */
export function isInsideLake(px: number, py: number, lake: Lake): boolean {
  return (
    px >= lake.x &&
    px <= lake.x + lake.widthTiles  * TILE_SIZE &&
    py >= lake.y &&
    py <= lake.y + lake.heightTiles * TILE_SIZE
  );
}

/** Tile span for one row of the chamfered desert shape. */
export function getDesertRowSpan(desert: DesertBiome, row: number) {
  if (row < 0 || row >= desert.heightTiles) return null;
  const fromTop = Math.max(0, desert.cornerCutTiles - row);
  const fromBottom = Math.max(0, desert.cornerCutTiles - (desert.heightTiles - 1 - row));
  const inset = Math.max(fromTop, fromBottom);
  return { startCol: inset, endCol: desert.widthTiles - 1 - inset };
}

/** True when a world-space point belongs to the chamfered desert shape. */
export function isInsideDesert(px: number, py: number, desert: DesertBiome): boolean {
  if (
    px < desert.x ||
    px >= desert.x + desert.widthTiles * TILE_SIZE ||
    py < desert.y ||
    py >= desert.y + desert.heightTiles * TILE_SIZE
  ) return false;
  const col = Math.floor((px - desert.x) / TILE_SIZE);
  const row = Math.floor((py - desert.y) / TILE_SIZE);
  const span = getDesertRowSpan(desert, row);
  return span !== null && col >= span.startCol && col <= span.endCol;
}

/**
 * Generate rare, large desert patches around lakes so each biome includes a
 * lake and uses the authored water/sand transition tiles on its shoreline.
 */
export function generateDesertBiomes(lakes: Lake[], count = 2): DesertBiome[] {
  const deserts: DesertBiome[] = [];
  const usedLakeIds = new Set<string>();
  let attempts = 0;

  while (deserts.length < count && attempts < count * 60) {
    attempts++;
    const lake = lakes[Math.floor(Math.random() * lakes.length)];
    if (!lake || usedLakeIds.has(lake.id)) continue;

    const widthTiles = 36 + Math.floor(Math.random() * 9);
    const heightTiles = 24 + Math.floor(Math.random() * 7);
    const cornerCutTiles = 5 + Math.floor(Math.random() * 3);
    const lakeCenterX = lake.x + lake.widthTiles * TILE_SIZE / 2;
    const lakeCenterY = lake.y + lake.heightTiles * TILE_SIZE / 2;
    // Center the lake inside a distinctly wider-than-tall desert patch.
    const x = Math.round((lakeCenterX - widthTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
    const y = Math.round((lakeCenterY - heightTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
    const candidate: DesertBiome = {
      id: `desert_${deserts.length}`,
      x,
      y,
      widthTiles,
      heightTiles,
      cornerCutTiles,
    };
    const centerX = x + widthTiles * TILE_SIZE / 2;
    const centerY = y + heightTiles * TILE_SIZE / 2;
    if (Math.hypot(centerX, centerY) < 800) continue;

    const hasCrossingLake = lakes.some(other => {
      if (other.id === lake.id || !rectanglesOverlap(candidate, other)) return false;
      const fullyInside = other.x >= x + TILE_SIZE &&
        other.y >= y + TILE_SIZE &&
        other.x + other.widthTiles * TILE_SIZE <= x + widthTiles * TILE_SIZE - TILE_SIZE &&
        other.y + other.heightTiles * TILE_SIZE <= y + heightTiles * TILE_SIZE - TILE_SIZE;
      return !fullyInside;
    });
    if (hasCrossingLake || deserts.some(other => rectanglesOverlap(candidate, other, 6))) continue;

    deserts.push(candidate);
    usedLakeIds.add(lake.id);
  }

  return deserts;
}

/** Place normal trees on plains and cacti in desert patches; avoid lake tiles. */
export function generateAppleTrees(count: number, lakes: Lake[], deserts: DesertBiome[]): AppleTree[] {
  const trees: AppleTree[] = [];
  let attempts = 0;
  while (trees.length < count && attempts < 200) {
    attempts++;
    const x = (Math.random() - 0.5) * 4000;
    const y = (Math.random() - 0.5) * 4000;
    // Keep away from origin so player doesn't start inside a tree
    if (Math.hypot(x, y) < 200) continue;
    const inLake = lakes.some(l => isInsideLake(x, y, l));
    const inDesert = deserts.some(d => isInsideDesert(x, y, d));
    if (!inLake && !inDesert) {
      trees.push({ id: String(trees.length), x, y, appleTimer: 0, hasApple: false, kind: 'apple' });
    }
  }

  for (const desert of deserts) {
    const cactusCount = 3 + Math.floor(Math.random() * 3);
    let placed = 0;
    let cactusAttempts = 0;
    while (placed < cactusCount && cactusAttempts < cactusCount * 12) {
      cactusAttempts++;
      const row = 2 + Math.floor(Math.random() * Math.max(1, desert.heightTiles - 4));
      const span = getDesertRowSpan(desert, row);
      if (!span || span.endCol - span.startCol < 3) continue;
      const col = span.startCol + 1 + Math.floor(Math.random() * (span.endCol - span.startCol - 1));
      const x = desert.x + (col + 0.5) * TILE_SIZE;
      const y = desert.y + (row + 0.5) * TILE_SIZE;
      if (lakes.some(lake => isInsideLake(x, y, lake))) continue;
      if (trees.some(tree => Math.hypot(tree.x - x, tree.y - y) < TILE_SIZE * 3)) continue;
      trees.push({
        id: `cactus_${desert.id}_${placed}`,
        x,
        y,
        appleTimer: 0,
        hasApple: false,
        kind: 'cactus',
      });
      placed++;
    }
  }
  return trees;
}
