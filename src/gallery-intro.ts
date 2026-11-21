const INTRO_MS = 1100;

export class GalleryIntro {
  private played = false;
  private timer?: ReturnType<typeof setTimeout>;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private effects: HTMLElement;
  private cards: HTMLElement[] = [];
  private animations: Animation[] = [];

  constructor(private view: HTMLElement) {
    this.effects = view.querySelector<HTMLElement>('.gallery-impact-layer')!;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
    });
    this.reduced.addEventListener('change', () => {
      if (this.reduced.matches) this.stop();
    });
    window.addEventListener('pagehide', () => this.stop());
    window.addEventListener('resize', () => this.stop());
  }

  play() {
    if (this.played || this.view.hidden || document.hidden || this.reduced.matches) return;
    this.played = true;
    const intro = this.view.querySelector<HTMLElement>('.gallery-intro')!;
    const art = this.view.querySelector<HTMLElement>('.gallery-neon-art')!;
    const energyWidth = intro.clientWidth * 0.98;
    const artWidth = art.clientWidth;
    const balls = [...art.querySelectorAll<HTMLElement>('.gallery-marble')].map((ball) => ({
      ball,
      left: ball.offsetLeft,
      radius: ball.offsetWidth / 2,
      color: getComputedStyle(ball).getPropertyValue('--ball-color'),
    }));
    for (const card of this.view.querySelectorAll<HTMLElement>('.map-card')) {
      const bounds = card.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) this.cards.push(card);
      if (this.cards.length === 8) break;
    }

    this.view.style.setProperty('--energy-width', energyWidth + 'px');
    this.cards.forEach((card, index) => {
      card.style.setProperty('--entry-delay', 60 + Math.min(index, 5) * 38 + 'ms');
      card.classList.add('map-card-entering');
    });
    this.view.classList.add('gallery-entering');
    const last = balls.at(-1);
    if (last) {
      const distance = Math.min(72, Math.max(0, artWidth * 0.96 - last.left - last.radius * 2));
      balls.forEach(({ ball, left, radius, color }, index) => {
        if (radius) this.roll(ball, left, radius, color, distance, index * 50);
      });
    }
    this.timer = setTimeout(() => this.stop(), INTRO_MS);
  }

  stop() {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.view.classList.remove('gallery-entering');
    this.view.style.removeProperty('--energy-width');
    for (const card of this.cards) {
      card.classList.remove('map-card-entering');
      card.style.removeProperty('--entry-delay');
    }
    for (const animation of this.animations) animation.cancel();
    this.cards = [];
    this.animations = [];
    this.effects.replaceChildren();
  }

  private roll(ball: HTMLElement, left: number, radius: number, color: string, distance: number, delay: number) {
    const duration = 900;
    // Keep exact contact frames. Easing covers the gaps between samples.
    const poses: [offset: number, height: number, stretch: number][] = [
      [0, radius, 1],
      [0.12, radius * 0.64, 1],
      [0.2, 0, 0.86],
      [0.26, radius * 0.23, 1],
      [0.34, 0, 0.96],
      [0.44, 0, 1],
      [0.7, 0, 1],
      [1, 0, 1],
    ];
    const xAt = (offset: number) => distance * (1 - offset) ** 2;
    const timing: KeyframeAnimationOptions = { duration, delay, fill: 'both' };
    const body = ball.querySelector<HTMLElement>('.gallery-marble-body')!;
    const core = ball.querySelector<HTMLElement>('.gallery-marble-core')!;
    const shadow = ball.querySelector<HTMLElement>('.gallery-marble-shadow')!;
    this.animations.push(
      ball.animate(
        poses.map(([offset, height]) => ({ offset, transform: 'translate(' + xAt(offset) + 'px, ' + -height + 'px)' })),
        timing
      ),
      body.animate(
        poses.map(([offset, , stretch]) => ({
          offset,
          transform: 'scale(' + (1 + (1 - stretch) * 0.65) + ', ' + stretch + ')',
        })),
        timing
      ),
      core.animate([{ transform: 'rotate(' + distance / radius + 'rad)' }, { transform: 'rotate(0rad)' }], {
        ...timing,
        easing: 'cubic-bezier(.33,.67,.67,1)',
      }),
      shadow.animate(
        poses.map(([offset, height]) => ({
          offset,
          transform: 'translateY(' + height + 'px) scaleX(' + (1 + height / 45) + ')',
          opacity: 0.65 / (1 + height / 12),
        })),
        timing
      )
    );

    const ring = document.createElement('i');
    ring.className = 'gallery-impact-ring';
    ring.style.cssText = 'left:' + (left + radius + xAt(0.2)) + 'px;top:118px;--impact-color:' + color;
    this.effects.append(ring);
    this.animations.push(
      ring.animate(
        [
          { opacity: 0, transform: 'scale(.5,.18)' },
          { offset: 0.18, opacity: 0.72, transform: 'scale(1.5,.42)' },
          { opacity: 0, transform: 'scale(4.5,1.15)' },
        ],
        { duration: 390, delay: delay + duration * 0.2, fill: 'both', easing: 'cubic-bezier(.2,.7,.3,1)' }
      )
    );
  }
}
