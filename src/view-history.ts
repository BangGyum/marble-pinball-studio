type View = 'gallery' | 'game';
const stateKey = 'marblePinballView';

export class ViewHistory {
  constructor(private show: (view: View) => void) {
    const state = window.history.state;
    window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}), [stateKey]: 'gallery' }, '');
    window.addEventListener('popstate', (event) => {
      this.show(event.state?.[stateKey] === 'game' ? 'game' : 'gallery');
    });
  }

  enterGame() {
    if (window.history.state?.[stateKey] !== 'game')
      window.history.pushState({ ...window.history.state, [stateKey]: 'game' }, '');
  }

  returnToGallery() {
    if (window.history.state?.[stateKey] === 'game') window.history.back();
    else this.show('gallery');
  }
}
