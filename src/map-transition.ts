/** Brief map selection effect; it never runs in the game's frame loop. */
export class MapTransition {
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private layer?: HTMLElement;
  private card?: HTMLElement;
  private select?: () => void;
  private reveal?: () => void;
  private revealFrame = 0;
  private swapTimer?: ReturnType<typeof setTimeout>;
  private endTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private gallery: HTMLElement,
    private game: HTMLElement
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.finish();
    });
    this.reduced.addEventListener('change', () => {
      if (this.reduced.matches) this.finish();
    });
    window.addEventListener('resize', () => this.finish());
    window.addEventListener('pagehide', () => this.finish());
  }

  play(card: HTMLElement, select: () => void, reveal: () => void) {
    if (this.layer || this.gallery.hidden) return;
    if (this.reduced.matches || document.hidden) {
      select();
      reveal();
      return;
    }
    const bounds = card.getBoundingClientRect();
    const layer = document.createElement('div');
    layer.className = 'map-transition';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--map-color', card.style.getPropertyValue('--map-color'));
    layer.style.setProperty(
      '--from-x',
      `${Math.max(0, Math.min(window.innerWidth, bounds.left + bounds.width / 2)) - window.innerWidth / 2}px`
    );
    layer.style.setProperty(
      '--from-y',
      `${Math.max(0, Math.min(window.innerHeight, bounds.top + bounds.height / 2)) - window.innerHeight / 2}px`
    );
    layer.innerHTML =
      '<div class="map-transition-cover"></div><div class="map-transition-ring"><div class="map-transition-orbit"><i class="map-transition-marble"></i></div></div><div class="map-transition-beam"></div><div class="map-transition-copy"><span></span><strong></strong><div class="map-transition-track"><i></i></div></div>';
    layer.querySelector('span')!.textContent =
      `코스 ${card.querySelector('.map-card-number')!.textContent} · 경주 준비`;
    layer.querySelector('strong')!.textContent = card.querySelector('.map-card-title')!.textContent;
    this.layer = layer;
    this.card = card;
    this.select = select;
    this.reveal = reveal;
    card.classList.add('map-card-launching');
    document.body.append(layer);
    this.gallery.inert = this.game.inert = true;
    // The cover is opaque before replacing the gallery with the prepared game.
    this.swapTimer = setTimeout(() => this.swap(), 300);
    this.endTimer = setTimeout(() => this.finish(), 1600);
  }

  private swap() {
    const select = this.select;
    this.select = undefined;
    select?.();
    // Allow a browser paint between physics preparation and the first cold-cache render.
    if (select)
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = requestAnimationFrame(() => this.show());
      });
  }

  private show() {
    cancelAnimationFrame(this.revealFrame);
    this.revealFrame = 0;
    const reveal = this.reveal;
    this.reveal = undefined;
    reveal?.();
  }

  finish() {
    if (!this.layer) return;
    try {
      this.swap();
      this.show();
    } finally {
      this.cancel();
    }
  }

  cancel() {
    if (!this.layer) return;
    clearTimeout(this.swapTimer);
    clearTimeout(this.endTimer);
    this.swapTimer = this.endTimer = undefined;
    this.select = undefined;
    this.reveal = undefined;
    cancelAnimationFrame(this.revealFrame);
    this.revealFrame = 0;
    this.card!.classList.remove('map-card-launching');
    this.layer.remove();
    this.layer = undefined;
    this.gallery.inert = this.game.inert = false;
    if (!document.hidden) {
      const focus = this.game.hidden ? this.card : this.game.querySelector<HTMLElement>('#maps-open');
      focus?.focus({ preventScroll: true });
    }
    this.card = undefined;
  }
}
