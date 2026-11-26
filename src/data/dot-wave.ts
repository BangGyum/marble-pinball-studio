import type { StageDef } from '../stage-def';
import type { MapEntity } from '../types/map-entity';
import { curve, wall } from './wind-map-shapes';

const width = 38;
const center = width / 2;
const pinRadius = 0.24;
const bumpers = [
  [10, 39],
  [28, 39],
  [19, 45],
];

function pin(x: number, y: number, radius = pinRadius, bumper = false): MapEntity {
  return {
    type: 'static',
    position: { x, y },
    shape: { type: 'circle', radius, color: bumper ? '#ffd184' : '#64f4e0' },
    props: { density: 1, restitution: bumper ? 0.72 : 0.36, angularVelocity: 0 },
  };
}

type Point = [number, number];
const leftBank: Point[] = [[0.8, -20]];
// Gradual entries divert the pack inward without collecting it at a sharp bend.
for (const y of [22, 34, 46, 58]) {
  const crest = y + 0.55;
  const entryY = Math.max(y - 7.4, leftBank.at(-1)![1] + 0.1);
  leftBank.push(
    ...curve([0.8, entryY], [0.8, y - 4.8], [6.5, crest - 2.55], [6.5, crest]),
    ...curve([6.5, crest], [6.5, crest + 1.45], [0.8, y + 4.5], [0.8, y + 5.3]).slice(1)
  );
}
leftBank.push([0.8, 64]);
const reflect = ([x, y]: Point): Point => [width - x, y];
const rightBank = leftBank.map(reflect);

function clearsBank(x: number, y: number) {
  const clearance = pinRadius + 1.6;
  const nearX = Math.min(x, width - x);
  for (let i = 1; i < leftBank.length; i++) {
    const [ax, ay] = leftBank[i - 1],
      [bx, by] = leftBank[i];
    if (y < ay - clearance || y > by + clearance) continue;
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(0, Math.min(1, ((nearX - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if (Math.hypot(nearX - ax - t * dx, y - ay - t * dy) < clearance) return false;
    if (y >= ay && y <= by && nearX < ax + ((y - ay) * dx) / dy) return false;
  }
  return true;
}

const pins: MapEntity[] = [];
// Slight offsets and narrower pins keep the starting pack from stacking in straight columns.
for (let row = 0; row < 6; row++) {
  for (let col = 0; col <= row + 2; col++) {
    // Open the middle at the mouth and catch marbles on both shoulders.
    if (row === 0 && col === 1) continue;
    const x = center + (col - (row + 2) / 2) * 2.16;
    const offset = Math.sin(x * 1.2 + (8 + row * 1.85) * 0.4) * 0.33;
    const spread = row === 0 ? Math.sign(x - center) * 0.72 : 0;
    pins.push(pin(x + offset + spread, 8.2 + row * 1.95, row === 0 ? 0.34 : 0.18));
  }
}

for (let row = 0; row < 12; row++) {
  for (let col = 0; col < 16; col++) {
    const belowFanCenter = row === 0 && col === 8;
    const x = 2.1 + (col + (row % 2) / 2) * 2.12;
    const y = 20.8 + row * 2.35 + 1.55 * Math.sin(x * 0.24 + row * 0.35);
    // Two curved gaps give the crowded middle of the wave room to pass.
    const lane = 4 + 1.5 * Math.sin((y - 20) * 0.21);
    // Give marbles rebounding off the side bumpers an open landing below them.
    const landing = y > 44 && y < 46 && Math.abs(Math.abs(x - center) - 9.6) < 0.5;
    if (
      !landing &&
      Math.abs(Math.abs(x - center) - lane) > 1.45 &&
      clearsBank(x, y) &&
      bumpers.every(([bx, by]) => Math.hypot(x - bx, y - by) > 2.65)
    )
      // Offset the first center pin to give marbles room to separate after the fan.
      pins.push(belowFanCenter ? pin(x - 0.53, y + 0.68, 0.19) : pin(x, y));
  }
}
for (const [x, y] of bumpers) pins.push(pin(x, y, 1.05, true));

// Open the last waves progressively before the side rails converge.
for (let row = 0; row < 5; row++) {
  const pitch = 2.8 + row * 0.19;
  for (let col = -5; col <= 5; col++) {
    const x = center + (col + (row % 2) / 2) * pitch;
    const y = 51.6 + row * 3 + Math.sin(x * 0.23 + row * 0.4);
    if (x > 2 && x < width - 2 && clearsBank(x, y)) pins.push(pin(x, y));
  }
}

const leftExit = curve([0.8, 64], [0.8, 68], [6, 70], [9, 72]);
const rightExit = leftExit.map(reflect);
const leftRail: [number, number][] = [...leftExit, [9, 75]];
const rightRail: [number, number][] = [...rightExit, [width - 9, 75]];
export const dotWave: StageDef = {
  title: '도트 파도',
  width,
  spawnX: center,
  randomizeStart: true,
  art: {
    style: 'dot-wave',
    contours: [
      [...leftBank.slice(0, -1), ...leftRail, ...rightRail.slice().reverse(), ...rightBank.slice(0, -1).reverse()],
    ],
  },
  goalY: 73,
  zoomY: 68,
  entities: [wall([...leftBank.slice().reverse(), ...rightBank], 0), wall(leftRail, 0), wall(rightRail, 0), ...pins],
};
