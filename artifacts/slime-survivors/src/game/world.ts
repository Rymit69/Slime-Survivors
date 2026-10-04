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

/** True when a world-space point belongs to any generated desert patch. */
export function isInsideDesert(px: number, py: number, desert: DesertBiome): boolean {
  return px >= desert.x &&
    px <= desert.x + desert.widthTiles * TILE_SIZE &&
    py >= desert.y &&
    py <= desert.y + desert.heightTiles * TILE_SIZE;
}

/**
 * Generate a few rare desert patches beside lakes so the authored water/sand
 * transition tiles are used naturally. Patches stay away from the spawn point.
 */
export function generateDesertBiomes(lakes: Lake[], count = 2): DesertBiome[] {
  const deserts: DesertBiome[] = [];
  const usedLakeIds = new Set<string>();
  let attempts = 0;

  while (deserts.length < count && attempts < count * 60) {
    attempts++;
    const lake = lakes[Math.floor(Math.random() * lakes.length)];
    if (!lake || usedLakeIds.has(lake.id)) continue;

    const widthTiles = 12 + Math.floor(Math.random() * 7);
    const heightTiles = 12 + Math.floor(Math.random() * 7);
    const side = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;

    if (side === 0 || side === 1) {
      x = side === 0
        ? lake.x - widthTiles * TILE_SIZE
        : lake.x + lake.widthTiles * TILE_SIZE;
      y = lake.y + (lake.heightTiles * TILE_SIZE - heightTiles * TILE_SIZE) / 2;
    } else {
      y = side === 2
        ? lake.y - heightTiles * TILE_SIZE
        : lake.y + lake.heightTiles * TILE_SIZE;
      x = lake.x + (lake.widthTiles * TILE_SIZE - widthTiles * TILE_SIZE) / 2;
    }

    // Align sand tiles to the same world grid as the lake and terrain.
    x = Math.round(x / TILE_SIZE) * TILE_SIZE;
    y = Math.round(y / TILE_SIZE) * TILE_SIZE;
    const candidate: DesertBiome = {
      id: `desert_${deserts.length}`,
      x,
      y,
      widthTiles,
      heightTiles,
    };
    const centerX = x + widthTiles * TILE_SIZE / 2;
    const centerY = y + heightTiles * TILE_SIZE / 2;
    if (Math.hypot(centerX, centerY) < 800) continue;

    const overlapsOtherLake = lakes.some(other =>
      other.id !== lake.id && rectanglesOverlap(candidate, other, 1)
    );
    if (overlapsOtherLake || deserts.some(other => rectanglesOverlap(candidate, other, 3))) continue;

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
    const cactusCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < cactusCount; i++) {
      const x = desert.x + (2 + Math.random() * Math.max(1, desert.widthTiles - 4)) * TILE_SIZE;
      const y = desert.y + (2 + Math.random() * Math.max(1, desert.heightTiles - 4)) * TILE_SIZE;
      trees.push({
        id: `cactus_${desert.id}_${i}`,
        x,
        y,
        appleTimer: 0,
        hasApple: false,
        kind: 'cactus',
      });
    }
  }
  return trees;
}
