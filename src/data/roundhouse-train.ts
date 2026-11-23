import type { EntityPolylineShape } from '../types/map-entity';

type Point = [number, number];
type CarName = NonNullable<EntityPolylineShape['trainCar']>;
type Car = {
  width: number;
  height: number;
  row: number;
  rowHeight: number;
  axleX: number;
  axleY: number;
  wheelbase: number;
  gauge: number;
  hull: Point[];
};

export const railRadius = 15.55;
export const railGauge = 2.16;
// Hulls and axle centres are in the approved artwork's original pixel coordinates.
// The first edge of each hull runs horizontally and registers the sprite to its fixture.
export const trainCars: Record<CarName, Car> = {
  engine: {
    width: 1145,
    height: 286,
    row: 0,
    rowHeight: 170,
    axleX: 615,
    axleY: 146.5,
    wheelbase: 362,
    gauge: 221,
    hull: [
      [105, 10],
      [321, 10],
      [1013, 36],
      [1046, 72],
      [1046, 234],
      [1013, 263],
      [225, 281],
      [82, 272],
    ],
  },
  tender: {
    width: 1044,
    height: 255,
    row: 170,
    rowHeight: 166,
    axleX: 521.5,
    axleY: 126.5,
    wheelbase: 457,
    gauge: 223,
    hull: [
      [151, 19],
      [875, 19],
      [946, 52],
      [957, 90],
      [957, 175],
      [900, 232],
      [149, 232],
      [90, 199],
    ],
  },
  coach: {
    width: 1336,
    height: 282,
    row: 336,
    rowHeight: 144,
    axleX: 632,
    axleY: 140.5,
    wheelbase: 574,
    gauge: 253,
    hull: [
      [106, 24],
      [1228, 24],
      [1260, 55],
      [1260, 225],
      [1228, 257],
      [106, 257],
      [80, 227],
      [80, 54],
    ],
  },
};

export function trainFixtures(spin: number): EntityPolylineShape[] {
  const direction = Math.sign(spin);
  let phase = 0;
  let previousRear = 0;
  return (Object.keys(trainCars) as CarName[]).map((name, index) => {
    const car = trainCars[name];
    let scale = railGauge / car.gauge;
    let pivot = railRadius;
    // Fit both axle stations to concentric rails. A straight chassis sits on a chord.
    for (let i = 0; i < 4; i++) {
      const halfBase = (scale * car.wheelbase) / 2;
      const inner = Math.sqrt((railRadius - railGauge / 2) ** 2 - halfBase ** 2);
      const outer = Math.sqrt((railRadius + railGauge / 2) ** 2 - halfBase ** 2);
      scale = (outer - inner) / car.gauge;
      pivot = (inner + outer) / 2;
    }
    const front = Math.atan2((car.width - car.axleX) * scale, pivot);
    if (index) phase -= direction * (previousRear + front);
    previousRear = Math.atan2(car.axleX * scale, pivot);
    const points = car.hull.map(([px, py]): Point => {
      const radial = pivot - direction * (py - car.axleY) * scale;
      const tangent = direction * (px - car.axleX) * scale;
      return [
        radial * Math.cos(phase) - tangent * Math.sin(phase),
        radial * Math.sin(phase) + tangent * Math.cos(phase),
      ];
    });
    return { type: 'polyline', solid: true, hidden: true, trainCar: name, rotation: 0, points: [...points, points[0]] };
  });
}
