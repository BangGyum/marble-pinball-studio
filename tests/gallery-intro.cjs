const assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    f
  );
const { GalleryIntro } = require('../src/gallery-intro.ts');

function fixture({ hidden = false, reduced = false, width = 400, cardTops = [-200, 350, 830] } = {}) {
  const animations = [],
    timers = new Map(),
    documentEvents = {},
    windowEvents = {},
    motionEvents = {};
  const element = (properties = {}) => ({
    style: {
      setProperty(key, value) {
        this[key] = value;
      },
      removeProperty(key) {
        delete this[key];
      },
    },
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      },
    },
    animate(frames, timing) {
      const animation = {
        frames,
        timing,
        cancelled: false,
        cancel() {
          this.cancelled = true;
        },
      };
      animations.push(animation);
      return animation;
    },
    ...properties,
  });
  const motion = {
    matches: reduced,
    addEventListener(type, listener) {
      motionEvents[type] = listener;
    },
  };
  global.window = {
    innerHeight: 800,
    matchMedia: () => motion,
    addEventListener(type, listener) {
      windowEvents[type] = listener;
    },
  };
  global.document = {
    hidden,
    createElement: () => element(),
    addEventListener(type, listener) {
      documentEvents[type] = listener;
    },
  };
  global.getComputedStyle = () => ({ getPropertyValue: () => '#78f5db' });
  global.setTimeout = (callback, delay) => {
    timers.set(callback, delay);
    return callback;
  };
  global.clearTimeout = (callback) => timers.delete(callback);
  const effects = {
    children: [],
    append(child) {
      this.children.push(child);
    },
    replaceChildren() {
      this.children = [];
    },
  };
  const balls = [35, 29, 24].map((size, index) =>
    element({
      offsetLeft: width * [0.3, 0.51, 0.7][index],
      offsetWidth: size,
      querySelector: () => element(),
    })
  );
  const cards = cardTops.map((top) => element({ getBoundingClientRect: () => ({ top, bottom: top + 100 }) }));
  const nodes = {
    '.gallery-impact-layer': effects,
    '.gallery-intro': { clientWidth: width * 2 },
    '.gallery-neon-art': { clientWidth: width, querySelectorAll: () => balls },
  };
  const view = element({
    hidden: false,
    querySelector: (selector) => nodes[selector],
    querySelectorAll: (selector) =>
      selector === '.map-card' ? cards : cards.filter((card) => card.classList.contains('map-card-entering')),
    getAnimations: () => animations.filter((animation) => !animation.cancelled),
  });
  return {
    intro: new GalleryIntro(view),
    view,
    cards,
    effects,
    animations,
    timers,
    motion,
    documentEvents,
    windowEvents,
    motionEvents,
  };
}

for (const width of [160, 400]) {
  const f = fixture({ width });
  f.intro.play();
  assert.ok(f.view.classList.contains('gallery-entering'));
  assert.deepEqual(
    f.cards.map((card) => card.classList.contains('map-card-entering')),
    [false, true, false],
    'only visible cards enter'
  );
  assert.equal(f.effects.children.length, 21);
  const deformations = f.animations.filter(
    (animation) => animation.frames[0].offset === 0 && animation.frames[0].transform.startsWith('scale(')
  );
  assert.equal(deformations.length, 3, 'each marble body deforms independently of its shadow and rolling pattern');
  for (const animation of deformations) {
    const scales = animation.frames.map((frame) =>
      frame.transform
        .match(/scale\(([\d.]+), ([\d.]+)\)/)
        .slice(1)
        .map(Number)
    );
    assert.ok(
      scales.some(([, y]) => y < 0.98),
      'impact creates a visible squash'
    );
    assert.ok(
      scales.every(([x, y]) => x >= 1 && x <= 1.12 && y >= 0.8 && y <= 1),
      'deformation stays subtle and finite'
    );
    assert.deepEqual(scales.at(-1), [1, 1], 'marbles finish perfectly round');
  }
  for (const animation of f.animations) {
    assert.ok(
      animation.timing.duration + animation.timing.delay < 2000,
      'every marble/particle finishes before cleanup'
    );
    assert.equal(animation.timing.iterations, undefined, 'no looping animations');
    if (!('offset' in animation.frames[0])) continue;
    assert.ok(!JSON.stringify(animation.frames).includes('NaN'));
    if (!animation.frames[0].transform.startsWith('translate(')) continue;
    const points = animation.frames.map((frame) =>
      frame.transform
        .match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)
        .slice(1)
        .map(Number)
    );
    assert.deepEqual(points.at(-1), [0, 0], 'marbles finish at the CSS resting position');
    assert.ok(
      points.every(([x, y], index) => x >= 0 && y <= 0 && (!index || x <= points[index - 1][0])),
      'rolling slows towards the left without penetrating the rail'
    );
  }
  const [finish, delay] = [...f.timers][0];
  assert.equal(delay, 2000);
  finish();
  assert.equal(f.timers.size, 0);
  assert.equal(f.effects.children.length, 0);
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.ok(!f.view.classList.contains('gallery-entering'));
  assert.ok(f.cards.every((card) => !card.classList.contains('map-card-entering')));
  assert.equal(f.cards[1].style['--entry-delay'], undefined);
  const allocated = f.animations.length;
  f.intro.play();
  assert.equal(f.animations.length, allocated, 'returning from a game does not replay or allocate effects');
}
console.log(
  'PASS finite gallery entry, visible cards, natural resting positions and complete cleanup at desktop/mobile widths'
);

{
  const f = fixture({ cardTops: Array.from({ length: 12 }, (_, i) => 100 + i * 40) });
  f.intro.play();
  const delays = f.cards.map((card) => parseFloat(card.style['--entry-delay']));
  assert.ok(
    delays.every((delay, index) => !index || delay >= delays[index - 1]),
    'visible cards enter in order'
  );
  assert.ok(Math.max(...delays) + 110 + 900 < 2000, 'even a large visible grid finishes before the intro cleanup');
  f.intro.stop();
  assert.ok(f.cards.every((card) => !card.classList.contains('map-card-entering')));
}
console.log('PASS contact squash settles round and staggered cards finish within the existing two-second entrance');

for (const action of ['stop', 'hidden', 'pagehide', 'resize', 'reduced']) {
  const f = fixture();
  f.intro.play();
  if (action === 'stop') f.intro.stop();
  else if (action === 'hidden') {
    document.hidden = true;
    f.documentEvents.visibilitychange();
  } else if (action === 'reduced') {
    f.motion.matches = true;
    f.motionEvents.change();
  } else f.windowEvents[action]();
  assert.equal(f.timers.size, 0, action);
  assert.equal(f.effects.children.length, 0, action);
  assert.ok(
    f.animations.every((animation) => animation.cancelled),
    action
  );
  f.intro.stop(); // Repeated lifecycle notifications remain safe.
}
console.log('PASS game/editor cancellation, background tab, page exit, resize and reduced-motion cleanup');

for (const state of ['view-hidden', 'document-hidden', 'reduced']) {
  const f = fixture({ hidden: state === 'document-hidden', reduced: state === 'reduced' });
  f.view.hidden = state === 'view-hidden';
  f.intro.play();
  assert.equal(f.animations.length, 0, state);
  assert.equal(f.timers.size, 0, state);
  assert.ok(!f.view.classList.contains('gallery-entering'), state);
}
console.log('PASS hidden or reduced-motion entry does not schedule animation work');
