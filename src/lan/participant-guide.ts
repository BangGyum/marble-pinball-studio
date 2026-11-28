import './participant-guide.css';

const cookieName = 'pinball_lan_guide';
const storageKey = 'marble-pinball.lan-guide';
const steps = [
  {
    id: 'minimap',
    title: '미니맵으로 원하는 구간 보기',
    description: '왼쪽 미니맵에 마우스를 올리면 그 위치로 시야가 이동해요.',
    hint: '미니맵을 벗어나면 자동 관전으로 돌아가요.',
    status: '미니맵 아래쪽 보기',
  },
  {
    id: 'ranking',
    title: '특정 구슬 따라가기',
    description: '오른쪽 위 순위표에서 이름을 누르면 시야가 그 구슬을 따라가요.',
    hint: '같은 이름을 다시 누르거나 Esc를 누르면 추적이 풀려요.',
    status: '‘둘’ 구슬 추적 중',
  },
  {
    id: 'spring',
    title: '내 스프링 설치하고 발동하기',
    description: '스프링 배치를 누르고, 맵에서 위치와 밀어낼 방향을 차례로 클릭해요.',
    hint: '경기 중 Space나 발동 버튼으로 한 번 튕길 수 있어요.',
    status: '위치 → 방향 → 발동',
  },
] as const;

function hasSeenGuide() {
  try {
    if (document.cookie.split(';').some((cookie) => cookie.trim() === cookieName + '=seen')) return true;
  } catch {}
  try {
    return localStorage.getItem(storageKey) === 'seen';
  } catch {
    return false;
  }
}

function rememberGuide() {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: The LAN client uses HTTP on private IPs, where Cookie Store is unavailable.
    document.cookie = cookieName + '=seen; Path=/; SameSite=Lax; Max-Age=34560000';
  } catch {}
  try {
    localStorage.setItem(storageKey, 'seen');
  } catch {}
}

type Point = [number, number];
type Anchor = () => Point;
type CursorFrame = [time: number, anchor: Anchor, opacity?: number];

export function createParticipantGuide(dialog: HTMLDialogElement) {
  const find = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const demo = find('.guide-demo');
  const board = find('.guide-board');
  const course = find('.guide-course');
  const map = find('.guide-mini-course');
  const mapWindow = find('.guide-mini-window');
  const rank = find('.guide-demo-rank');
  const target = find('.guide-target');
  const status = find('.guide-demo-status');
  const spring = find('.guide-spring');
  const assembly = find('.guide-spring-assembly');
  const direction = find('.guide-spring-direction');
  const base = find('.guide-spring-base');
  const bellows = find('.guide-bellows');
  const face = find('.guide-spring-face');
  const launchBall = find('.guide-launch-ball');
  const place = find('.guide-place');
  const key = find('.guide-demo-key');
  const keycap = find('.guide-demo-key kbd');
  const pointer = find<SVGSVGElement>('.guide-pointer');
  const ring = find('.guide-click-ring');
  const next = find<HTMLButtonElement>('#participant-guide-next');
  const skip = find<HTMLInputElement>('#participant-guide-skip');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animations: Animation[] = [];
  const layoutUpdates: (() => void)[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let index = 0;
  let offered = false;

  function clearDemo() {
    layoutUpdates.length = 0;
    for (const animation of animations.splice(0)) animation.cancel();
    for (const timer of timers.splice(0)) clearTimeout(timer);
    delete dialog.dataset.following;
    delete dialog.dataset.placing;
    delete dialog.dataset.fired;
    pointer.classList.add('guide-pointer-hidden');
    key.hidden = true;
    place.textContent = '⇧ 스프링 배치';
  }

  function animate(element: Element, duration: number, frames: Keyframe[] | (() => Keyframe[])) {
    const animation = element.animate(typeof frames === 'function' ? frames() : frames, { duration, fill: 'both' });
    animations.push(animation);
    if (typeof frames === 'function') {
      const effect = animation.effect as KeyframeEffect;
      layoutUpdates.push(() => effect.setKeyframes(frames()));
    }
  }

  function at(ms: number, action: () => void) {
    timers.push(setTimeout(action, ms));
  }

  function anchor(element: Element, x = 0.5, y = 0.5): Anchor {
    return () => {
      const bounds = element.getBoundingClientRect();
      const stage = demo.getBoundingClientRect();
      return [bounds.left - stage.left + bounds.width * x, bounds.top - stage.top + bounds.height * y];
    };
  }

  function movePointer(duration: number, frames: CursorFrame[]) {
    pointer.classList.remove('guide-pointer-hidden');
    animate(pointer, duration, () =>
      frames.map(([time, position, opacity = 1]) => {
        const [x, y] = position();
        return {
          offset: time / duration,
          transform: `translate(${x - 3}px, ${y - 2}px)`,
          opacity,
          easing: 'ease-in-out',
        };
      })
    );
  }

  function clickAt(position: Anchor) {
    animate(ring, 400, () => {
      const [x, y] = position();
      const transform = `translate(${x - 12}px, ${y - 12}px)`;
      return [
        { transform: transform + ' scale(.45)', opacity: 1 },
        { transform: transform + ' scale(1.65)', opacity: 0 },
      ];
    });
  }

  function showMinimap() {
    const start = anchor(board, 0.37, 0.26);
    const upper = anchor(map, 0.62, 0.35);
    const lower = anchor(map, 0.62, 0.68);
    movePointer(3200, [
      [0, start, 0],
      [240, start],
      [850, upper],
      [1360, upper],
      [2420, lower],
      [3200, lower],
    ]);
    animate(course, 3200, [
      { transform: 'translateY(90px)', offset: 0 },
      { transform: 'translateY(90px)', offset: 0.266, easing: 'ease-out' },
      { transform: 'translateY(38px)', offset: 0.425, easing: 'ease-in-out' },
      { transform: 'translateY(-75px)', offset: 0.756 },
      { transform: 'translateY(-75px)', offset: 1 },
    ]);
    animate(mapWindow, 3200, [
      { top: '24%', offset: 0 },
      { top: '24%', offset: 0.425, easing: 'ease-in-out' },
      { top: '57%', offset: 0.756 },
      { top: '57%', offset: 1 },
    ]);
    status.textContent = '자동 관전';
    target.hidden = true;
    at(850, () => {
      status.textContent = '미니맵에 마우스를 올렸어요';
      target.hidden = false;
    });
    at(2420, () => {
      status.textContent = '이 구간으로 시야 이동';
    });
  }

  function showRanking() {
    const start = anchor(board, 0.55, 0.32);
    const selected = anchor(rank, 0.47);
    movePointer(3650, [
      [0, start, 0],
      [220, start],
      [1000, selected],
      [1400, selected],
      [1760, selected, 0],
      [3650, selected, 0],
    ]);
    animate(course, 3650, [
      { transform: 'translate(-14px, 65px)', offset: 0 },
      { transform: 'translate(-14px, 65px)', offset: 0.274, easing: 'ease-in-out' },
      { transform: 'translate(26px, 9px)', offset: 0.56, easing: 'ease-out' },
      { transform: 'translate(39px, -74px)', offset: 1 },
    ]);
    status.textContent = '오른쪽 위에서 구슬 선택';
    target.hidden = true;
    at(1000, () => {
      clickAt(selected);
      dialog.dataset.following = '';
      status.textContent = steps[1].status;
      target.hidden = false;
    });
  }

  function showSpring() {
    const start = anchor(board, 0.75, 0.28);
    const button = anchor(place, 0.68);
    const origin = anchor(base);
    const aimLeft = anchor(spring, 0.11, 0.24);
    const aimRight = anchor(spring, 0.89, 0.24);
    movePointer(5450, [
      [0, start, 0],
      [180, start],
      [850, button],
      [1150, button],
      [1610, anchor(board, 0.89, 0.37)],
      [2180, origin],
      [2440, origin],
      [2770, aimLeft],
      [3220, aimRight],
      [3570, aimRight],
      [3950, aimRight, 0],
      [5450, aimRight, 0],
    ]);
    status.textContent = '스프링 배치 버튼 누르기';
    spring.style.visibility = 'hidden';
    animate(assembly, 5450, [
      { transform: 'rotate(-28deg)', offset: 0 },
      { transform: 'rotate(-28deg)', offset: 0.508, easing: 'ease-in-out' },
      { transform: 'rotate(28deg)', offset: 0.591 },
      { transform: 'rotate(28deg)', offset: 1 },
    ]);
    animate(direction, 5450, [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.447 },
      { opacity: 1, offset: 0.508 },
      { opacity: 1, offset: 1 },
    ]);
    animate(launchBall, 5450, [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.591 },
      { opacity: 1, transform: 'none', offset: 0.64 },
      { opacity: 1, transform: 'none', offset: 0.738, easing: 'ease-out' },
      { opacity: 1, transform: 'translateY(-86px)', offset: 0.92 },
      { opacity: 1, transform: 'translate(12px, -81px)', offset: 1 },
    ]);
    at(850, () => {
      clickAt(button);
      dialog.dataset.placing = '';
      status.textContent = '맵에서 위치 클릭';
    });
    at(2180, () => {
      clickAt(origin);
      spring.style.visibility = '';
      status.textContent = '밀어낼 방향 지정';
    });
    at(3220, () => {
      clickAt(aimRight);
      key.hidden = false;
      place.textContent = '발동 · Space';
      status.textContent = '방향 확정';
    });
    at(4020, () => {
      dialog.dataset.fired = '';
      place.textContent = '사용 완료';
      status.textContent = '스프링 발동';
      animate(keycap, 300, [{ transform: 'none' }, { transform: 'translateY(2px) scale(.9)' }, { transform: 'none' }]);
      animate(bellows, 550, [{ transform: 'none' }, { transform: 'scaleY(2)', offset: 0.24 }, { transform: 'none' }]);
      animate(face, 550, [
        { transform: 'none' },
        { transform: 'translateY(-18px)', offset: 0.24 },
        { transform: 'none' },
      ]);
    });
  }

  function replay() {
    clearDemo();
    const step = steps[index];
    status.textContent = step.status;
    target.hidden = step.id === 'spring';
    spring.hidden = step.id !== 'spring';
    spring.style.visibility = '';
    if (reducedMotion.matches) {
      if (step.id === 'ranking') dialog.dataset.following = '';
      if (step.id === 'spring') {
        key.hidden = false;
        dialog.dataset.placing = '';
      }
      return;
    }
    if (step.id === 'minimap') showMinimap();
    if (step.id === 'ranking') showRanking();
    if (step.id === 'spring') showSpring();
  }

  function showStep() {
    const step = steps[index];
    dialog.dataset.step = step.id;
    find('#participant-guide-title').textContent = step.title;
    find('#participant-guide-description').textContent = step.description;
    find('#participant-guide-hint').textContent = step.hint;
    find('#participant-guide-step').textContent = `${index + 1} / ${steps.length}`;
    next.textContent = index === steps.length - 1 ? '완료 ✓' : '다음 →';
    replay();
  }

  function close(completed = false) {
    if (completed || skip.checked) rememberGuide();
    clearDemo();
    dialog.close();
  }

  function advance() {
    if (index === steps.length - 1) close(true);
    else {
      index += 1;
      showStep();
    }
  }

  next.addEventListener('click', advance);
  find('#participant-guide-close').addEventListener('click', () => close());
  find('#participant-guide-replay').addEventListener('click', replay);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!dialog.open || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const space = event.code === 'Space' || event.key === ' ';
      if (!space && event.key !== 'Escape' && event.key !== 'Enter') return;
      event.stopImmediatePropagation();
      // Let the focused control handle Space; elsewhere it advances the walkthrough.
      if (space && (event.target === skip || (event.target instanceof HTMLButtonElement && event.target !== next)))
        return;
      event.preventDefault();
      if (event.repeat) return;
      if (space) advance();
      else close();
    },
    { capture: true }
  );

  return async function showParticipantGuide() {
    if (offered || hasSeenGuide()) return;
    offered = true;
    dialog.showModal();
    showStep();
    const resize = new ResizeObserver(() => {
      for (const update of layoutUpdates) update();
    });
    resize.observe(demo);
    resize.observe(board);
    reducedMotion.addEventListener('change', replay);
    await new Promise<void>((resolve) => dialog.addEventListener('close', () => resolve(), { once: true }));
    resize.disconnect();
    reducedMotion.removeEventListener('change', replay);
  };
}
