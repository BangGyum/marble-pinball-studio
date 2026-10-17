import { toast } from './ui';
import { setSceneTheme } from './scene-theme';

export function initTheme() {
  const root = document.documentElement;
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
  const apply = (beige: boolean) => {
    root.dataset.theme = beige ? 'beige' : 'dark';
    setSceneTheme(beige ? 'beige' : 'dark');
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = beige ? '#f4ede1' : '#090c10';
    for (const toggle of toggles) {
      toggle.setAttribute('aria-checked', String(beige));
      toggle.title = beige ? '다크 테마로 전환' : '베이지 테마로 전환';
      toggle.querySelector('.theme-toggle-label')!.textContent = beige ? '베이지' : '다크';
    }
    window.dispatchEvent(new Event('pinball-theme-change'));
  };
  // The head script restores the saved theme before the first paint.
  apply(root.dataset.theme === 'beige');
  for (const toggle of toggles) toggle.addEventListener('click', () => {
    apply(root.dataset.theme !== 'beige');
    try { localStorage.setItem('marble-pinball.theme', root.dataset.theme!); }
    catch { toast('테마는 변경했지만 저장하지 못했어요. 브라우저의 저장소 설정을 확인해 주세요.'); }
  });
}
