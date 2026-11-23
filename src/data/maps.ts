import { reversalLadder } from './reversal-ladder';
import { seesawValley } from './seesaw-valley';
import { shortcutCascade } from './shortcut-cascade';
import { infiniteFunnel } from './infinite-funnel';
import { twinFunnel } from './twin-funnel';
import { oneBounce } from './one-bounce';
import { lastGondola } from './last-gondola';
import { launcherLab } from './launcher-lab';
import { springLab } from './spring-lab';
import { roundhouse } from './roundhouse';
import { neonJunction } from './neon-junction';
import { pipelineRun } from './pipeline-run';
import { twinVortex } from './twin-vortex';
import { zigzagRapids } from './zigzag-rapids';
import { neonJackpot } from './neon-jackpot';
import { pinballCascade } from './pinball-cascade';
import { chaosClocktower } from './chaos-clocktower';
import { orbitalLock } from './orbital-lock';
import { neonCrossway } from './neon-crossway';
import { fractureCanyon } from './fracture-canyon';
import { switchbackExpress } from './switchback-express';
import { desireJar } from './desire-jar';
import { bounceStairs } from './bounce-stairs';
import { orbitingGate } from './orbiting-gate';
import type { StageDef } from '../stage-def';
import { mapPlayKeys, type MapPlayKey } from './map-play-keys';
export { ART_STYLES, type StageDef, type WindZone } from '../stage-def';

// Release order, oldest first. IDs are also used by saved selections and LAN rooms.
const builtins: [id: number, stage: StageDef, playKey?: MapPlayKey][] = [
  [1, desireJar, mapPlayKeys.desireJar],
  [2, neonJunction, mapPlayKeys.neonJunction],
  [3, pipelineRun, mapPlayKeys.pipelineRun],
  [4, twinVortex, mapPlayKeys.twinVortex],
  [5, zigzagRapids, mapPlayKeys.zigzagRapids],
  [0, neonJackpot, mapPlayKeys.neonJackpot],
  [6, pinballCascade, mapPlayKeys.pinballCascade],
  [7, chaosClocktower, mapPlayKeys.chaosClocktower],
  [8, orbitalLock, mapPlayKeys.orbitalLock],
  [9, fractureCanyon, mapPlayKeys.fractureCanyon],
  [10, neonCrossway, mapPlayKeys.neonCrossway],
  [11, switchbackExpress, mapPlayKeys.switchbackExpress],
  [12, roundhouse, mapPlayKeys.roundhouse],
  [13, springLab],
  [14, reversalLadder],
  [15, infiniteFunnel, mapPlayKeys.infiniteFunnel],
  [16, twinFunnel, mapPlayKeys.twinFunnel],
  [17, bounceStairs, mapPlayKeys.bounceStairs],
  [18, orbitingGate, mapPlayKeys.orbitingGate],
  [19, shortcutCascade, mapPlayKeys.shortcutCascade],
  [20, seesawValley, mapPlayKeys.seesawValley],
  [21, launcherLab, mapPlayKeys.launcherLab],
  [22, oneBounce, mapPlayKeys.oneBounce],
  [23, lastGondola, mapPlayKeys.lastGondola],
];

export const stages = [...builtins].sort(([a], [b]) => a - b).map(([, stage]) => stage);
export function mapPlayKey(stage: StageDef) {
  return builtins.find(([, builtin]) => builtin === stage)?.[2];
}

export const hiddenStages: StageDef[] = [springLab, reversalLadder, twinFunnel, chaosClocktower, twinVortex];
export const visibleBuiltins = builtins
  .filter(([, stage]) => !hiddenStages.includes(stage))
  .reverse()
  .map(([id, stage]) => ({ id, stage }));
export const DEFAULT_MAP_INDEX = stages.indexOf(neonJunction);
