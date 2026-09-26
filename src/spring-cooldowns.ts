import type { EntityBoxShape } from './types/MapEntity.type';
// Shape references survive entity index changes; session objects survive reconnects.
export class SpringCooldowns {
  private shared = new Map<EntityBoxShape, number>();
  private personal = new WeakMap<object, Map<EntityBoxShape, number>>();
  constructor(private now = () => Date.now()) {}
  reset() { this.shared.clear(); this.personal = new WeakMap(); }
  private ledger(shape: EntityBoxShape, player: object) {
    if (shape.spring?.cooldown?.scope === 'shared') return this.shared;
    let map = this.personal.get(player);
    if (!map) { map = new Map(); this.personal.set(player, map); }
    return map;
  }
  remaining(shape: EntityBoxShape, player: object) {
    return Math.max(0, (this.ledger(shape, player).get(shape) ?? 0) - this.now());
  }
  consume(shape: EntityBoxShape, player: object) {
    const seconds = shape.spring?.cooldown?.seconds ?? 0;
    if (seconds) this.ledger(shape, player).set(shape, this.now() + seconds * 1000);
  }
}
