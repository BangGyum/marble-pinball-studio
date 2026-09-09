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

  update(game: Race) {
    const items = getStandings(game).map((ball, i) => {
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
        this.rows.set(ball, item);
      }
      const rank = ball.rank ?? i + 1, finished = String(!!ball.rank);
      if (item.value !== rank || item.dataset.finished !== finished) {
        if (item.value !== rank) item.value = rank;
        if (item.dataset.finished !== finished) item.dataset.finished = finished;
        item.setAttribute('aria-label', rank + '등 ' + ball.name + (ball.rank ? ' · 도착' : ''));
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
