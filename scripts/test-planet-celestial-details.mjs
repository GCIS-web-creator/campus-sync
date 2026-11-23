import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoonCelestialDetail, createStarCelestialDetail } from '../lib/planet-celestial-details.ts';

test('star detail contains diameter, orbital/rotation period, temperature and habitability', () => {
  const detail = createStarCelestialDetail({
    id: 'star-1', systemName: 'アスタリア', starClass: 'G', starLabel: '黄色矮星',
    temperature: '約5,200〜6,000 K', planetId: 1, starIndex: 0, starCount: 1,
  });
  assert.match(detail.diameter, /139万/);
  assert.match(detail.orbitalPeriod, /単独恒星/);
  assert.match(detail.rotationPeriod, /日/);
  assert.match(detail.temperature, /K/);
  assert.match(detail.habitability, /ハビタブルゾーン/);
});

test('binary stars share the same orbital period', () => {
  const common = {
    systemName: 'バイセリア',
    temperature: '約3,700〜5,200 K',
    planetId: 44,
    starCount: 2,
  };
  const primary = createStarCelestialDetail({
    ...common, id: 'star-1', starClass: 'B', starLabel: '青色巨星', starIndex: 0,
  });
  const companion = createStarCelestialDetail({
    ...common, id: 'star-2', starClass: 'K', starLabel: '橙色矮星', starIndex: 1,
  });
  assert.match(primary.orbitalPeriod, /連星/);
  assert.equal(primary.orbitalPeriod, companion.orbitalPeriod);
});

test('moon detail exposes useful model-based facts and keeps output deterministic', () => {
  const args = { id: 'moon-1', systemName: 'オケアナ', moonIndex: 1, moonRadius: 0.12, orbitRadius: 10.5 };
  const detail = createMoonCelestialDetail(args);
  assert.match(detail.diameter, /km/);
  assert.match(detail.orbitalPeriod, /日/);
  assert.equal(detail.rotationPeriod, detail.orbitalPeriod.replace('（惑星の周囲）', '（潮汐固定を想定）'));
  assert.match(detail.habitability, /地下/);
  assert.deepEqual(createMoonCelestialDetail(args), detail);
});
