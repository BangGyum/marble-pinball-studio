import { DolphinSettingsPanel } from './dolphin-settings';
import { validateDolphins, type DolphinSettings } from './dolphin';
import type { AnimalKind } from './sea-animals';
import type { StageDef } from './stage-def';

export class SeaAnimalSettingsPanel {
  private dolphin: DolphinSettingsPanel;
  private manta: DolphinSettingsPanel;
  get value(): DolphinSettings {
    return { ...this.dolphin.value, manta: this.manta.value };
  }
  constructor(
    root: HTMLElement,
    change: (settings: DolphinSettings, commit: boolean) => void,
    previewChange: (show: boolean) => void,
    overview: (kind: AnimalKind) => void
  ) {
    root.classList.add('sea-animal-settings');
    const info = document.createElement('p');
    info.className = 'sea-animal-order';
    info.textContent = '돌고래와 만타가오리는 하나만 켤 수 있어요. 다른 효과를 켜면 기존 효과는 자동으로 꺼져요.';
    root.append(info);
    const make = (kind: AnimalKind) => {
      const section = document.createElement('section');
      section.dataset.animal = kind;
      root.append(section);
      return new DolphinSettingsPanel(
        section,
        (settings, commit) => {
          const other = kind === 'dolphin' ? this.manta : this.dolphin;
          if (settings.enabled && other.value.enabled) other.setEnabled(false);
          change(this.value, commit);
        },
        previewChange,
        () => overview(kind),
        kind
      );
    };
    this.dolphin = make('dolphin');
    this.manta = make('manta');
    // The animated preview is a local shared switch, not a race or LAN option.
    for (const input of root.querySelectorAll<HTMLInputElement>('[data-dolphin="preview"]')) {
      input.onchange = (event) => {
        const show = (event.target as HTMLInputElement).checked;
        for (const input of root.querySelectorAll<HTMLInputElement>('[data-dolphin="preview"]')) input.checked = show;
        this.dolphin.preview = this.manta.preview = show;
        previewChange(show);
      };
    }
  }
  setStage(stage: StageDef, settings?: DolphinSettings) {
    if (settings) {
      const { manta, ...dolphin } = validateDolphins(settings, stage);
      this.dolphin.setStage(stage, dolphin);
      this.manta.setStage(stage, manta ?? validateDolphins(undefined, stage));
    } else {
      this.dolphin.setStage(stage);
      this.manta.setStage(stage);
    }
  }
  moved(settings: DolphinSettings) {
    const { manta, ...dolphin } = settings;
    if (JSON.stringify(this.dolphin.value) !== JSON.stringify(dolphin)) this.dolphin.moved(dolphin);
    if (manta && JSON.stringify(this.manta.value) !== JSON.stringify(manta)) this.manta.moved(manta);
  }
  setLocked(locked: boolean) {
    this.dolphin.setLocked(locked);
    this.manta.setLocked(locked);
  }
}
