/** A finite entrance animation, isolated from the game's render and physics loops. */
export class GalleryIntro {
  private played = false;
  private timer?: ReturnType<typeof setTimeout>;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private effects: HTMLElement;

  constructor(private view: HTMLElement) {
    this.effects = view.querySelector<HTMLElement>('.gallery-impact-layer')!;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
    this.reduced.addEventListener('change', () => { if (this.reduced.matches) this.stop(); });
    window.addEventListener('pagehide', () => this.stop());
    window.addEventListener('resize', () => this.stop());
  }

  play() {
    if (this.played || this.view.hidden || document.hidden || this.reduced.matches) return;
    this.played = true;
    const intro = this.view.querySelector<HTMLElement>('.gallery-intro')!;
    this.view.style.setProperty('--energy-width', `${intro.clientWidth * .98}px`);
    let order = 0;
    for (const card of this.view.querySelectorAll<HTMLElement>('.map-card')) {
      const bounds = card.getBoundingClientRect();
      if (bounds.top < window.innerHeight && bounds.bottom > 0) {
        card.style.setProperty('--entry-delay', `${340 + Math.min(order++, 3) * 105}ms`);
        card.classList.add('map-card-entering');
      }
    }
    this.view.classList.add('gallery-entering');
    this.rollMarbles();
    this.timer = setTimeout(() => this.stop(), 2000);
  }

  stop() {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.view.classList.remove('gallery-entering');
    for (const card of this.view.querySelectorAll<HTMLElement>('.map-card-entering')) {
      card.classList.remove('map-card-entering');
      card.style.removeProperty('--entry-delay');
    }
    for (const animation of this.view.getAnimations({ subtree: true })) animation.cancel();
    this.effects.replaceChildren();
  }

  private rollMarbles() {
    const duration = 1.35, gravity = 1600;
    const art = this.view.querySelector<HTMLElement>('.gallery-neon-art')!;
    const balls = [...art.querySelectorAll<HTMLElement>('.gallery-marble')];
    const last = balls[balls.length - 1];
    const distance = Math.min(78, Math.max(0, art.clientWidth * .96 - last.offsetLeft - last.offsetWidth));
    balls.forEach((ball, index) => {
      const radius = ball.offsetWidth / 2;
      const dropHeight = radius * (1.05 + index * .1);
      const fallTime = Math.sqrt(2 * dropHeight / gravity);
      const heightAt = (time: number) => {
        if (time < fallTime) return dropHeight - gravity * time * time / 2;
        let remaining = time - fallTime, speed = gravity * fallTime * .36;
        while (speed > 4) {
          const flight = 2 * speed / gravity;
          if (remaining < flight) return speed * remaining - gravity * remaining * remaining / 2;
          remaining -= flight;
          speed *= .36;
        }
        return 0;
      };
      const positions: Keyframe[] = [], rotations: Keyframe[] = [], shadows: Keyframe[] = [];
      for (let step = 0; step <= 120; step++) {
        const progress = step / 120, x = distance * (1 - progress) ** 2;
        const height = heightAt(progress * duration);
        positions.push({ offset: progress, transform: `translate(${x}px, ${-height}px)` });
        rotations.push({ offset: progress, transform: `rotate(${x / radius}rad)` });
        shadows.push({ offset: progress, transform: `translateY(${height}px) scaleX(${1 + height / 45})`, opacity: .65 / (1 + height / 12) });
      }
      const timing: KeyframeAnimationOptions = { duration: duration * 1000, delay: index * 85, easing: 'linear', fill: 'both' };
      ball.animate(positions, timing);
      ball.querySelector<HTMLElement>('.gallery-marble-core')!.animate(rotations, timing);
      ball.querySelector<HTMLElement>('.gallery-marble-shadow')!.animate(shadows, timing);
      ball.querySelector<HTMLElement>('.gallery-marble-trail')!.animate([
        { opacity: .65, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(.12)' },
      ], timing);
      const impactX = ball.offsetLeft + radius + distance * (1 - fallTime / duration) ** 2;
      const impactDelay = fallTime * 1000 + index * 85;
      const color = getComputedStyle(ball).getPropertyValue('--ball-color');
      const ring = document.createElement('i');
      ring.className = 'gallery-impact-ring';
      ring.style.cssText = `left:${impactX}px;top:118px;--impact-color:${color}`;
      this.effects.append(ring);
      ring.animate([
        { opacity: 0, transform: 'scale(.4,.15)' },
        { offset: .12, opacity: .9, transform: 'scale(1.6,.5)' },
        { opacity: 0, transform: 'scale(7,1.8)' },
      ], { duration: 850, delay: impactDelay, fill: 'both', easing: 'cubic-bezier(.2,.7,.3,1)' });
      for (let sparkIndex = 0; sparkIndex < 6; sparkIndex++) {
        const angle = -Math.PI * (.15 + sparkIndex * .14);
        const reach = (28 + sparkIndex % 3 * 13) * Math.min(1, art.clientWidth / 280);
        const spark = document.createElement('i');
        spark.className = 'gallery-impact-spark';
        spark.style.cssText = `left:${impactX}px;top:117px;--impact-color:${color}`;
        this.effects.append(spark);
        spark.animate([
          { opacity: 0, transform: 'translate(0,0)' },
          { offset: .12, opacity: 1, transform: `translate(${Math.cos(angle) * reach * .2}px,${Math.sin(angle) * reach * .2}px)` },
          { opacity: 0, transform: `translate(${Math.cos(angle) * reach}px,${Math.sin(angle) * reach + 12}px)` },
        ], { duration: 600, delay: impactDelay, fill: 'both', easing: 'cubic-bezier(.12,.6,.3,1)' });
      }
    });
  }
}
