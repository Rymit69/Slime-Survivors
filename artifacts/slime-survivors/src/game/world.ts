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

function randomIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Vary the north/south silhouette across columns so the top and bottom do not stay flat. */
function createHorizontalEdgeProfile(widthTiles: number) {
  const maxInset = randomIntInclusive(3, 6);
  const ridgeWidth = randomIntInclusive(7, 15);
  const ridgeStart = randomIntInclusive(8, widthTiles - 8 - ridgeWidth);
  const ridgeEnd = ridgeStart + ridgeWidth - 1;
  const profile = new Array<number>(widthTiles);

  for (let col = ridgeStart; col <= ridgeEnd; col++) {
    profile[col] = randomIntInclusive(0, 1);
  }
  const coreWidth = randomIntInclusive(4, Math.min(8, ridgeWidth));
  const coreStart = randomIntInclusive(ridgeStart, ridgeEnd - coreWidth + 1);
  for (let col = coreStart; col < coreStart + coreWidth; col++) {
    profile[col] = 0;
  }

  const extendSlope = (startCol: number, endCol: number, direction: -1 | 1) => {
    let inset = randomIntInclusive(1, 2);
    let distance = 0;
    let nextStepAt = randomIntInclusive(2, 4);

    for (let col = startCol; direction < 0 ? col >= endCol : col <= endCol; col += direction) {
      if (distance >= nextStepAt && inset < maxInset) {
        const increase = Math.random() < 0.18 ? 2 : Math.random() < 0.35 ? 0 : 1;
        inset = Math.min(maxInset, inset + increase);
        nextStepAt = distance + randomIntInclusive(2, 5);
      }
      profile[col] = inset;
      distance++;
    }
  };

  extendSlope(ridgeStart - 1, 0, -1);
  extendSlope(ridgeEnd + 1, widthTiles - 1, 1);
  return profile;
}

/** Build a pixel-stepped desert edge with short horizontal runs and uneven offsets. */
function createSteppedDesertRowSpans(widthTiles: number, heightTiles: number) {
  const makeSideProfile = () => {
    const profile = new Array<number>(heightTiles);
    const topSteps = randomIntInclusive(2, 5);
    const bottomSteps = randomIntInclusive(2, 5);
    const topRows = topSteps * 2 + 1;
    const bottomRows = bottomSteps * 2 + 1;
    let inset = 0;
    let nextStepAt = topRows + randomIntInclusive(1, 3);

    for (let row = 0; row < heightTiles; row++) {
      if (row < topRows) {
        inset = Math.max(0, topSteps - Math.floor(row / 2));
      } else if (row >= heightTiles - bottomRows) {
        const rowsFromBottom = heightTiles - 1 - row;
        inset = Math.max(0, bottomSteps - Math.floor(rowsFromBottom / 2));
      } else if (row === topRows) {
        inset = 0;
        nextStepAt = row + randomIntInclusive(1, 3);
      } else if (row >= nextStepAt) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        const step = Math.random() < 0.12 ? 2 : 1;
        const proposedInset = inset + direction * step;
        inset = proposedInset < 0 || proposedInset > 7
          ? Math.max(0, Math.min(7, inset - direction * step))
          : proposedInset;
        nextStepAt = row + randomIntInclusive(1, 3);
      }
      profile[row] = inset;
    }

    return profile;
  };

  const leftInsets = makeSideProfile();
  const rightInsets = makeSideProfile();
  const topInsets = createHorizontalEdgeProfile(widthTiles);
  const bottomInsets = createHorizontalEdgeProfile(widthTiles);

  return Array.from({ length: heightTiles }, (_, row) => {
    let startCol = leftInsets[row];
    let endCol = widthTiles - 1 - rightInsets[row];
    const isInsideHorizontalEdges = (col: number) =>
      row >= topInsets[col] && row < heightTiles - bottomInsets[col];

    while (startCol <= endCol && !isInsideHorizontalEdges(startCol)) startCol++;
    while (endCol >= startCol && !isInsideHorizontalEdges(endCol)) endCol--;
    return { startCol, endCol };
  });
}

/** Tile span for one row of the stepped desert shape. */
export function getDesertRowSpan(desert: DesertBiome, row: number) {
  if (row < 0 || row >= desert.heightTiles) return null;
  return desert.rowSpans[row] ?? null;
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
 * Generate large, separate desert patches across the world. A small number
 * are centered on lakes; all remaining patches are placed away from water.
 */
export function generateDesertBiomes(
  lakes: Lake[],
  count = 10 + Math.floor(Math.random() * 16),
): DesertBiome[] {
  const targetCount = Math.max(0, Math.floor(count));
  const deserts: DesertBiome[] = [];
  const usedLakeIds = new Set<string>();
  const lakeDesertTarget = lakes.length === 0 || targetCount === 0
    ? 0
    : Math.min(2, Math.max(1, Math.floor(targetCount / 10)), lakes.length);
  const anchorAttemptLimit = Math.max(120, lakes.length * 12);
  const spreadRadius = 6500;
  let lakeAttempts = 0;
  let attempts = 0;

  const lakeFitsInside = (lake: Lake, desert: DesertBiome) => {
    const left = lake.x + TILE_SIZE / 2;
    const right = lake.x + lake.widthTiles * TILE_SIZE - TILE_SIZE / 2;
    const top = lake.y + TILE_SIZE / 2;
    const bottom = lake.y + lake.heightTiles * TILE_SIZE - TILE_SIZE / 2;
    return [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].every(([x, y]) => isInsideDesert(x, y, desert));
  };

  const isValidCandidate = (candidate: DesertBiome, anchorLake: Lake | null) => {
    const nearestX = Math.max(candidate.x, Math.min(0, candidate.x + candidate.widthTiles * TILE_SIZE));
    const nearestY = Math.max(candidate.y, Math.min(0, candidate.y + candidate.heightTiles * TILE_SIZE));
    if (Math.hypot(nearestX, nearestY) < 900) return false;
    if (deserts.some(other => rectanglesOverlap(candidate, other, 4))) return false;

    const intersectingLakes = lakes.filter(lake => rectanglesOverlap(candidate, lake));
    if (!anchorLake) return intersectingLakes.length === 0;
    if (usedLakeIds.has(anchorLake.id) || !lakeFitsInside(anchorLake, candidate)) return false;
    return intersectingLakes.every(lake => lakeFitsInside(lake, candidate));
  };

  while (deserts.length < targetCount && attempts < Math.max(3000, targetCount * 1000)) {
    attempts++;
    const widthTiles = randomIntInclusive(54, 64);
    const heightTiles = randomIntInclusive(38, 46);
    const rowSpans = createSteppedDesertRowSpans(widthTiles, heightTiles);
    const shouldTryLake = usedLakeIds.size < lakeDesertTarget && lakeAttempts < anchorAttemptLimit;
    let anchorLake: Lake | null = null;

    if (shouldTryLake) {
      lakeAttempts++;
      const availableLakes = lakes.filter(lake => !usedLakeIds.has(lake.id));
      if (availableLakes.length > 0) {
        anchorLake = availableLakes[Math.floor(Math.random() * availableLakes.length)];
      }
    }

    let x: number;
    let y: number;
    if (anchorLake) {
      const centerX = anchorLake.x + anchorLake.widthTiles * TILE_SIZE / 2;
      const centerY = anchorLake.y + anchorLake.heightTiles * TILE_SIZE / 2;
      x = Math.round((centerX - widthTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
      y = Math.round((centerY - heightTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
    } else {
      const centerX = (Math.random() - 0.5) * spreadRadius * 2;
      const centerY = (Math.random() - 0.5) * spreadRadius * 2;
      x = Math.round((centerX - widthTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
      y = Math.round((centerY - heightTiles * TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE;
    }

    const candidate: DesertBiome = {
      id: `desert_${deserts.length}`,
      x,
      y,
      widthTiles,
      heightTiles,
      rowSpans,
    };
    if (!isValidCandidate(candidate, anchorLake)) continue;

    deserts.push(candidate);
    if (anchorLake) usedLakeIds.add(anchorLake.id);
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
