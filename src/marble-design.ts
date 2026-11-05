import { toast } from './ui';

export type MarbleDesign = 'ceramic' | 'racing-band';
let design: MarbleDesign = 'ceramic';

export const getMarbleDesign = () => design;
export function setMarbleDesign(next: MarbleDesign) {
  design = next;
}

export function initMarbleDesign() {
  const select = document.getElementById('marble-design') as HTMLSelectElement;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('marble-pinball.marble-design');
  } catch {}
  setMarbleDesign(saved === 'racing-band' ? 'racing-band' : 'ceramic');
  select.value = getMarbleDesign();
  select.addEventListener('change', () => {
    setMarbleDesign(select.value === 'racing-band' ? 'racing-band' : 'ceramic');
    window.dispatchEvent(new Event('pinball-marble-design-change'));
    try {
      localStorage.setItem('marble-pinball.marble-design', getMarbleDesign());
    } catch {
      toast('공 디자인은 변경했지만 저장하지 못했어요. 브라우저의 저장소 설정을 확인해 주세요.');
    }
  });
}
