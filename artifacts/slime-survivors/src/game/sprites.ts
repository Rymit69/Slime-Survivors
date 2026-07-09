const cache: Record<string, HTMLImageElement> = {};

const SPRITE_MAP: Record<string, string> = {
  slime1:          '/sprites/slime1.png',
  slime2:          '/sprites/slime2.png',
  slime_green1:    '/sprites/slime_green1.png',
  slime_green2:    '/sprites/slime_green2.png',
  slime_purple1:   '/sprites/slime_purple1.png',
  slime_purple2:   '/sprites/slime_purple2.png',
  slime_mini_blue:   '/sprites/slime_mini_blue.png',
  slime_mini_green:  '/sprites/slime_mini_green.png',
  slime_mini_purple: '/sprites/slime_mini_purple.png',
  bat1:            '/sprites/bat1.png',
  bat2:            '/sprites/bat2.png',
  goblin1:         '/sprites/goblin1.png',
  goblin2:         '/sprites/goblin2.png',
  skeleton1:       '/sprites/skeleton1.png',
  skeleton2:       '/sprites/skeleton2.png',
  ogre1:           '/sprites/ogre1.png',
  ogre2:           '/sprites/ogre2.png',
  grass:           '/sprites/grass.png',
  water_side:      '/sprites/water_side.png',
  water_corner:    '/sprites/water_corner.png',
  water:           '/sprites/water.png',
  apple_tree:      '/sprites/apple_tree.png',
  apple:           '/sprites/apple.png',
};

export function loadSprites(base: string = ''): Promise<void> {
  return Promise.all(
    Object.entries(SPRITE_MAP).map(([key, src]) =>
      new Promise<void>((resolve) => {
        if (cache[key]) { resolve(); return; }
        const img = new Image();
        img.onload = () => { cache[key] = img; resolve(); };
        img.onerror = () => { console.warn('Failed to load sprite:', src); resolve(); };
        img.src = base + src;
      })
    )
  ).then(() => {});
}

export function sp(key: string): HTMLImageElement | null {
  return cache[key] ?? null;
}
