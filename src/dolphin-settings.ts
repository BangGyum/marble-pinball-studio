import { dolphinBounds, dolphinRows, validateDolphins, type DolphinSettings } from './dolphin';
import type { StageDef } from './stage-def';

export class DolphinSettingsPanel {
  value: DolphinSettings = { enabled: false, rows: [], interval: 20 };
  preview = true;
  private stage?: StageDef;
  private locked = false;
  private gap = 20;
  private input<T extends HTMLElement>(name: string) { return this.root.querySelector<T>(`[data-dolphin="${name}"]`)!; }
  constructor(private root: HTMLElement, private change: (settings: DolphinSettings, commit: boolean) => void,
    private previewChange: (show: boolean) => void, private overview: () => void) {
    root.classList.add('dolphin-settings');
    root.innerHTML = `<div class="dolphin-heading"><label><strong>돌고래 효과</strong> <input data-dolphin="enabled" type="checkbox" role="switch" aria-label="돌고래 효과" /></label></div>
      <fieldset data-dolphin="fields" hidden><div class="dolphin-field"><label for="dolphin-count">줄 개수</label><div class="dolphin-stepper"><button data-dolphin="minus" type="button" aria-label="돌고래 줄 줄이기">−</button><input id="dolphin-count" data-dolphin="count" type="number" min="1" max="6" value="3" /><button data-dolphin="plus" type="button" aria-label="돌고래 줄 늘리기">＋</button></div></div>
      <div class="dolphin-field"><label for="dolphin-gap">균등 간격</label><div class="dolphin-spacing"><input data-dolphin="slider" type="range" min="0.5" max="100" step="0.5" value="20" aria-label="돌고래 줄 간격" /><input id="dolphin-gap" data-dolphin="gap" type="number" min="0.5" max="100" step="0.5" value="20" /><span>칸</span></div></div>
      <div class="dolphin-field"><label for="dolphin-interval">출몰 간격</label><div class="inline"><input id="dolphin-interval" data-dolphin="interval" type="number" min="6" max="120" step="1" value="20" /><span>초</span></div></div>
      <div class="dolphin-preview"><label class="check"><input data-dolphin="preview" type="checkbox" checked /> 배치 미리보기</label><button data-dolphin="overview" type="button">전체 배치 보기</button></div>
      <p data-dolphin="hint">점선을 위아래로 드래그해 줄마다 위치를 바꿀 수 있어요.</p><p class="muted">각 줄에서 경기 시작과 함께 등장해요. 출몰 간격은 배속이 적용된 경기 시간 기준입니다.</p></fieldset>`;
    const notify = (commit: boolean) => { this.sync(); this.change(this.value, commit); };
    this.input<HTMLInputElement>('enabled').onchange = () => {
      if (this.locked) return;
      this.value = { ...this.value, enabled: this.input<HTMLInputElement>('enabled').checked };
      notify(true); if (this.value.enabled) this.overview();
    };
    const arrange = (count: number, gap: number) => {
      if (this.locked || !this.stage || !Number.isFinite(count) || !Number.isFinite(gap)) return;
      this.value = { ...this.value, rows: dolphinRows(this.stage, count, Math.max(.5, Math.min(100, gap)), this.value.rows[0]) };
      this.gap = this.value.rows.length > 1 ? this.value.rows[1] - this.value.rows[0] : Math.max(.5, Math.min(100, gap));
      this.input('hint').textContent = '점선을 위아래로 드래그해 줄마다 위치를 바꿀 수 있어요.'; notify(true);
    };
    this.input<HTMLButtonElement>('minus').onclick = () => arrange(this.value.rows.length - 1, this.gap);
    this.input<HTMLButtonElement>('plus').onclick = () => arrange(this.value.rows.length + 1, this.gap);
    this.input<HTMLInputElement>('count').onchange = () => arrange(Number(this.input<HTMLInputElement>('count').value), this.gap);
    this.input<HTMLInputElement>('gap').onchange = () => arrange(this.value.rows.length, Number(this.input<HTMLInputElement>('gap').value));
    const slider = this.input<HTMLInputElement>('slider');
    slider.oninput = () => {
      if (this.locked || !this.stage) return;
      this.value = { ...this.value, rows: dolphinRows(this.stage, this.value.rows.length, Number(slider.value), this.value.rows[0]) };
      this.gap = this.value.rows.length > 1 ? this.value.rows[1] - this.value.rows[0] : Number(slider.value); notify(false);
    };
    slider.onchange = () => notify(true);
    this.input<HTMLInputElement>('interval').onchange = () => {
      if (this.locked) return;
      const seconds = Number(this.input<HTMLInputElement>('interval').value);
      this.value = { ...this.value, interval: Number.isFinite(seconds) ? Math.round(Math.max(6, Math.min(120, seconds))) : 20 }; notify(true);
    };
    this.input<HTMLInputElement>('preview').onchange = () => { this.preview = this.input<HTMLInputElement>('preview').checked; this.previewChange(this.preview); };
    this.input<HTMLButtonElement>('overview').onclick = () => this.overview();
  }
  setStage(stage: StageDef, settings?: DolphinSettings) {
    if (settings) this.value = validateDolphins(settings, stage);
    else {
      const { min, max } = dolphinBounds(stage);
      if (!this.value.rows.length || this.value.rows.some(y => y < min || y > max))
        this.value = { ...this.value, rows: dolphinRows(stage, this.value.rows.length || 3, this.gap) };
    }
    this.stage = stage;
    const gap = this.value.rows[1] - this.value.rows[0];
    const regular = this.value.rows.length < 2 || this.value.rows.every((y, i) => !i || Math.abs(y - this.value.rows[i - 1] - gap) < 1e-6);
    if (regular && this.value.rows.length > 1) this.gap = Math.round(gap * 2) / 2;
    this.sync();
    this.input('hint').textContent = regular ? '점선을 위아래로 드래그해 줄마다 위치를 바꿀 수 있어요.' : '개별 위치로 조정됨 · 균등 간격을 바꾸면 다시 정렬돼요.';
  }
  moved(settings: DolphinSettings) {
    this.value = settings; this.sync();
    this.input('hint').textContent = '개별 위치로 조정됨 · 균등 간격을 바꾸면 다시 정렬돼요.';
  }
  setLocked(locked: boolean) { this.locked = locked; this.sync(); }
  private sync() {
    this.input<HTMLInputElement>('enabled').checked = this.value.enabled;
    this.input<HTMLInputElement>('enabled').disabled = this.locked;
    const fields = this.input<HTMLFieldSetElement>('fields'); fields.hidden = !this.value.enabled; fields.disabled = this.locked;
    this.input<HTMLInputElement>('count').value = String(this.value.rows.length || 3);
    this.input<HTMLInputElement>('gap').value = String(Math.round(this.gap * 10) / 10);
    this.input<HTMLInputElement>('slider').value = String(this.gap);
    this.input<HTMLInputElement>('interval').value = String(this.value.interval);
    this.input<HTMLButtonElement>('minus').disabled = this.value.rows.length <= 1;
    this.input<HTMLButtonElement>('plus').disabled = this.value.rows.length >= 6;
    if (this.stage) {
      const { min, max } = dolphinBounds(this.stage), gapMax = this.value.rows.length > 1 ? Math.min(100, (max - min) / (this.value.rows.length - 1)) : 100;
      this.input<HTMLInputElement>('gap').max = this.input<HTMLInputElement>('slider').max = String(gapMax);
    }
  }
}
