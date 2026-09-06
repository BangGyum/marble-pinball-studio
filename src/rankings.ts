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
      item.value = ball.rank ?? i + 1;
      item.dataset.finished = String(!!ball.rank);
      item.setAttribute('aria-label', item.value + '등 ' + ball.name + (ball.rank ? ' · 도착' : ''));
      return item;
    });
    // Keep the same rows and scroll position when only arrival status changes.
    if (this.list.children.length !== items.length || items.some((item, i) => this.list.children[i] !== item)) {
      this.list.replaceChildren(...items);
    }
    this.list.hidden = !items.length;
  }
}
