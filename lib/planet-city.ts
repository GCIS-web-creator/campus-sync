// Layout of the near-future city seen from street level. Units are metres; the
// viewer stands on the street at the origin and looks toward negative z.

export type CityShape = 'box' | 'round' | 'taper';

export type CityBuilding = {
  x: number;
  z: number;
  /** Height of the base above the street (upper setbacks start on a roof). */
  y: number;
  width: number;
  depth: number;
  height: number;
  shape: CityShape;
  /** 0 window grid, 1 ribbon floors, 2 vertical fins, 3 glass curtain. */
  style: number;
  seed: number;
  tier: 'frontage' | 'midtown' | 'tower' | 'landmark';
};

export const CITY_STREET_HALF_WIDTH = 13;
export const CITY_VIEWPOINT = { x: -3.5, y: 1.65, z: 20 } as const;
export const CITY_LANDMARK = { x: 4, z: -620 } as const;

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

export function buildCityLayout(planetNumber: number, stage: number) {
  const random = randomFrom(planetNumber * 104_729 + 17);
  const buildings: CityBuilding[] = [];
  const between = (low: number, high: number) => low + random() * (high - low);

  const add = (
    entry: Omit<CityBuilding, 'y' | 'shape' | 'style' | 'seed'> & { shape?: CityShape; style?: number },
    setbacks = true,
  ) => {
    const roll = random();
    const shape = entry.shape ?? (entry.tier === 'frontage' || roll < 0.62 ? 'box' : roll < 0.82 ? 'round' : 'taper');
    const base: CityBuilding = {
      ...entry, y: 0, shape, style: entry.style ?? Math.floor(random() * 4), seed: random(),
    };
    buildings.push(base);
    // A narrower upper volume breaks up the skyline.
    if (setbacks && random() < 0.5) {
      buildings.push({
        ...base, y: base.height, width: base.width * between(0.45, 0.75), depth: base.depth * between(0.45, 0.75),
        height: base.height * between(0.18, 0.48), seed: random(),
      });
    }
  };

  // Two street walls running past the viewer.
  for (const side of [-1, 1]) {
    for (let z = 130; z > -500;) {
      const along = between(9, 24);
      const across = between(11, 22);
      const setBack = CITY_STREET_HALF_WIDTH + between(0, 2.5);
      add({
        x: side * (setBack + across / 2), z: z - along / 2, width: across, depth: along,
        height: between(14, z > -60 ? 38 : 58), tier: 'frontage',
      });
      z -= along + between(0.4, 2.2);
    }
    for (let z = 140; z > -520;) {
      const along = between(16, 30);
      add({ x: side * between(46, 56), z: z - along / 2, width: between(16, 24), depth: along, height: between(48, 125), tier: 'midtown' });
      z -= along + between(1, 7);
    }
  }
  // The street ends in a low block so the view rises toward the landmark.
  for (let x = -62; x <= 62; x += 18) {
    add({ x: x + between(-3, 3), z: -525 - between(0, 20), width: between(13, 19), depth: between(14, 24), height: between(24, 66), tier: 'midtown' });
  }

  // Packed blocks out to the horizon, rising with distance.
  const cell = 31;
  for (let gx = -23; gx <= 23; gx += 1) {
    for (let gz = -36; gz <= 7; gz += 1) {
      const x = gx * cell + between(-6, 6);
      const z = gz * cell + between(-6, 6);
      if (Math.abs(x) < 74 && z > -560) continue; // street, street walls and second row
      if (Math.hypot(x - CITY_LANDMARK.x, z - CITY_LANDMARK.z) < 70) continue;
      const distance = Math.hypot(x, z);
      let height = between(30, 80) + Math.min(130, distance * 0.14) * random();
      if (Math.abs(x) < 150 && z > -520) height = Math.min(height, 96);
      add({ x, z, width: between(15, 25), depth: between(15, 25), height, tier: 'midtown' });
    }
  }

  // Megatowers, kept out of the sight line to the landmark.
  for (let index = 0; index < 52; index += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const x = side * between(105, 620);
    const z = between(-1_050, 120);
    add({ x, z, width: between(24, 42), depth: between(24, 42), height: between(190, 360) + stage * 12, tier: 'tower' }, true);
  }
  // Twin towers flank the central spire.
  for (const [x, z, height] of [[-82, -430, 330], [96, -470, 372]]) {
    add({ x, z, width: 34, depth: 34, height: height + stage * 15, shape: 'taper', style: 3, tier: 'tower' }, false);
  }
  const landmarkHeight = 560 + stage * 34;
  add({ x: CITY_LANDMARK.x, z: CITY_LANDMARK.z, width: 74, depth: 74, height: landmarkHeight * 0.72, shape: 'taper', style: 3, tier: 'landmark' }, false);
  buildings.push({
    x: CITY_LANDMARK.x, z: CITY_LANDMARK.z, y: landmarkHeight * 0.72, width: 41, depth: 41,
    height: landmarkHeight * 0.34, shape: 'taper', style: 3, seed: 0.93, tier: 'landmark',
  });

  return { buildings, landmarkHeight: landmarkHeight * 1.06 };
}
