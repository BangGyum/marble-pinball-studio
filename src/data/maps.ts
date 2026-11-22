import { reversalLadder } from './reversal-ladder';
import { seesawValley } from './seesaw-valley';
import { shortcutCascade } from './shortcut-cascade';
import { infiniteFunnel } from './infinite-funnel';
import { twinFunnel } from './twin-funnel';
import { oneBounce } from './one-bounce';
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

const builtins: [StageDef, MapPlayKey?][] = [
  [neonJackpot, mapPlayKeys.neonJackpot],
  [desireJar, mapPlayKeys.desireJar],
  [neonJunction, mapPlayKeys.neonJunction],
  [pipelineRun, mapPlayKeys.pipelineRun],
  [twinVortex, mapPlayKeys.twinVortex],
  [zigzagRapids, mapPlayKeys.zigzagRapids],
  [pinballCascade, mapPlayKeys.pinballCascade],
  [chaosClocktower, mapPlayKeys.chaosClocktower],
  [orbitalLock, mapPlayKeys.orbitalLock],
  [fractureCanyon, mapPlayKeys.fractureCanyon],
  [neonCrossway, mapPlayKeys.neonCrossway],
  [switchbackExpress, mapPlayKeys.switchbackExpress],
  [roundhouse, mapPlayKeys.roundhouse],
  [springLab],
  [reversalLadder],
  [infiniteFunnel, mapPlayKeys.infiniteFunnel],
  [twinFunnel, mapPlayKeys.twinFunnel],
  [bounceStairs, mapPlayKeys.bounceStairs],
  [orbitingGate, mapPlayKeys.orbitingGate],
  [shortcutCascade, mapPlayKeys.shortcutCascade],
  [seesawValley, mapPlayKeys.seesawValley],
  [launcherLab, mapPlayKeys.launcherLab],
  [oneBounce, mapPlayKeys.oneBounce],
];

export const stages = builtins.map(([stage]) => stage);
export function mapPlayKey(stage: StageDef) {
  return builtins.find(([builtin]) => builtin === stage)?.[1];
}

export const hiddenStages: StageDef[] = [springLab, reversalLadder];
export const DEFAULT_MAP_INDEX = stages.indexOf(neonJunction);
