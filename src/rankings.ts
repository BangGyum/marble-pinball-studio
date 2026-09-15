import type { Ball, Game } from './game';
import { el } from './ui';

type Race = Pick<Game, 'state' | 'balls' | 'arrivals'>;

export function getStandings(game: Race): Ball[] {
  if (game.state === 'ready') return [];
  return [...game.arrivals, ...game.balls.filter((ball) => !ball.rank).sort((a, b) => b.y - a.y || a.id - b.id)];
}

export class Rankings {
  private rows = new WeakMap<Ball, HTMLLIElement>();
  private list = el<HTMLOListElement>('ranking-list');
  constructor(private select?: (id: number) => void) {}

  update(game: Race, selectedId: number | null = null) {
    const ready = game.state === 'ready' && !!this.select;
    const items = (ready ? game.balls : getStandings(game)).map((ball, i) => {
      let item = this.rows.get(ball);
      if (!item) {
        item = document.createElement('li');
        const color = document.createElement('span');
        color.className = 'ranking-color';
        color.style.backgroundColor = ball.color;
        color.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.className = 'ranking-name';
        name.textContent = ball.name;
        name.title = ball.name;
        item.append(color, name);
        if (this.select) {
          item.tabIndex = 0; item.setAttribute('role', 'button');
          item.addEventListener('click', () => this.select!(ball.id));
          item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.select!(ball.id); }
          });
        }
        this.rows.set(ball, item);
      }
      const rank = ready ? 0 : ball.rank ?? i + 1, finished = String(!!ball.rank);
      if (item.value !== rank || item.dataset.finished !== finished) {
        if (item.value !== rank) item.value = rank;
        if (item.dataset.finished !== finished) item.dataset.finished = finished;
        item.setAttribute('aria-label', (ready ? '대기 · ' : rank + '등 ') + ball.name + (ball.rank ? ' · 도착' : ''));
      }
      if (this.select) {
        const selected = String(selectedId === ball.id);
        if (item.getAttribute('aria-pressed') !== selected) item.setAttribute('aria-pressed', selected);
        if (item.dataset.ready !== String(ready)) item.dataset.ready = String(ready);
      }
      return item;
    });
    if (this.list.children.length !== items.length) {
      this.list.replaceChildren(...items);
    } else {
      // Move only displaced rows; don't detach the entire list at every overtake.
      let next = this.list.firstElementChild;
      for (const item of items) {
        if (item !== next) this.list.insertBefore(item, next);
        else next = next.nextElementSibling;
      }
    }
    if (this.list.hidden !== !items.length) this.list.hidden = !items.length;
  }
}
