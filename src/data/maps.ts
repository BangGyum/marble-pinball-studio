import { reversalLadder } from './reversal-ladder';
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
import { neonHourglass } from './neon-hourglass';
import { neonCrossway } from './neon-crossway';
import { fractureCanyon } from './fracture-canyon';
import { switchbackExpress } from './switchback-express';
import { desireJar } from './desire-jar';
import type { StageDef } from '../stage-def';
export { ART_STYLES, type StageDef, type WindZone } from '../stage-def';

export const stages: StageDef[] = [
  neonJackpot,
  desireJar,
  neonJunction,
  pipelineRun,
  twinVortex,
  zigzagRapids,
  pinballCascade,
  chaosClocktower,
  orbitalLock,
  neonHourglass,
  fractureCanyon,
  neonCrossway,
  switchbackExpress,
  roundhouse,
  springLab,
  reversalLadder,
];

export const DEFAULT_MAP_INDEX = stages.indexOf(neonJunction);
