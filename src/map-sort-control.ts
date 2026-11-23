import type { MapPlayKey } from './data/map-play-keys';
import { getMapPlayCount } from './map-plays';

type Group = 'builtin' | 'custom';
type SortCard = { node: HTMLButtonElement; title: string; key?: MapPlayKey };
const byTitle = new Intl.Collator('ko', { numeric: true });

export class MapSortControl {
  private group?: Group;
  private cards: SortCard[] = [];
  private preferences = { builtin: 'recent', custom: 'recent' };

  constructor(
    private select: HTMLSelectElement,
    private grid: HTMLElement,
    private status: HTMLElement,
    onChange: () => void
  ) {
    this.select.addEventListener('change', () => {
      if (!this.group) return;
      this.preferences[this.group] = this.select.value;
      try {
        localStorage.setItem('marble-pinball.map-sort.' + this.group, this.select.value);
      } catch {
        // Keep the current session's choice when storage is unavailable.
      }
      onChange();
      this.apply();
    });
  }

  show(group: Group, cards: SortCard[]) {
    this.cards = cards;
    if (this.group !== group) {
      this.group = group;
      const options = [
        new Option(group === 'builtin' ? '최신순' : '최근 저장순', 'recent'),
        new Option('이름순', 'name'),
      ];
      if (group === 'builtin') options.push(new Option('플레이 많은 순', 'plays'));
      this.select.replaceChildren(...options);
      let preference = this.preferences[group];
      try {
        preference = localStorage.getItem('marble-pinball.map-sort.' + group) ?? preference;
      } catch {
        // The in-memory preference still applies.
      }
      this.select.value = options.some((option) => option.value === preference) ? preference : 'recent';
    }
    this.apply();
  }

  refreshCounts() {
    if (this.select.value === 'plays') this.apply();
  }

  private apply() {
    const ordered = [...this.cards];
    const count = (card: SortCard) => (card.key && getMapPlayCount(card.key)) ?? -1;
    if (this.select.value === 'name') ordered.sort((a, b) => byTitle.compare(a.title, b.title));
    if (this.select.value === 'plays') ordered.sort((a, b) => count(b) - count(a));
    this.status.hidden = this.select.value !== 'plays' || ordered.some((card) => count(card) >= 0);
    const focused = document.activeElement;
    ordered.forEach(({ node }, i) => {
      const current = this.grid.children.item(i);
      if (current !== node) this.grid.insertBefore(node, current);
      node.querySelector('.map-card-number')!.textContent = String(i + 1).padStart(2, '0');
    });
    if (focused instanceof HTMLElement && focused !== document.activeElement && this.grid.contains(focused))
      focused.focus({ preventScroll: true });
  }
}
