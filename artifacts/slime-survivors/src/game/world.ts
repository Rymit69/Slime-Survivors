import { Lake, AppleTree } from './entities';

export const TILE_SIZE = 32;

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
      x: cx - (widthTiles  * TILE_SIZE) / 2,
      y: cy - (heightTiles * TILE_SIZE) / 2,
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

/** Place 3-5 apple trees scattered on the map, avoiding lake tiles. */
export function generateAppleTrees(count: number, lakes: Lake[]): AppleTree[] {
  const trees: AppleTree[] = [];
  let attempts = 0;
  while (trees.length < count && attempts < 200) {
    attempts++;
    const x = (Math.random() - 0.5) * 4000;
    const y = (Math.random() - 0.5) * 4000;
    // Keep away from origin so player doesn't start inside a tree
    if (Math.hypot(x, y) < 200) continue;
    const inLake = lakes.some(l => isInsideLake(x, y, l));
    if (!inLake) {
      trees.push({ id: String(trees.length), x, y, appleTimer: 0, hasApple: false });
    }
  }
  return trees;
}
