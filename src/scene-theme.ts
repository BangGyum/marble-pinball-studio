export type SceneTheme = 'dark' | 'beige';
let theme: SceneTheme = 'dark';
const colors = new Map<string, string>();

export const getSceneTheme = () => theme;
export function setSceneTheme(next: SceneTheme) { theme = next; }
export const sceneGlow = (blur: number) => theme === 'beige' ? 0 : blur;

// Convert drawing colors only; saved maps and physics shapes keep their original colors.
// Cache the palette so live rotors and trains do not repeat color conversion each frame.
export function sceneColor(color: string): string {
  if (theme === 'dark') return color;
  const cached = colors.get(color);
  if (cached) return cached;
  if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) return color;
  let hex = color.slice(1);
  if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const alpha = hex.slice(6), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const sourceLight = (max + min) / 2, accent = sourceLight >= .5 && delta >= .08;
  const sourceHue = delta === 0 ? 0 : ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
  const [hue, saturation] = delta < .08 ? [35, .26]
    : sourceHue < 35 || sourceHue >= 330 ? [18, .36]
    : sourceHue < 80 ? [36, .44]
    : sourceHue < 195 ? [83, .25]
    : accent && sourceHue < 245 ? [210, .18]
    : accent && sourceHue < 290 ? [295, .18]
    : sourceHue < 265 ? [33, .24] : [12, .28];
  const light = Math.max(accent ? .34 : .26, .94 - sourceLight);
  const amplitude = saturation * Math.min(light, 1 - light);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  // Translucent near-black strokes are shadows, not opaque background surfaces.
  const mapped = alpha && max < .07 ? '#654b31' + alpha : '#' + channel(0) + channel(8) + channel(4) + alpha;
  if (colors.size >= 4096) colors.clear();
  colors.set(color, mapped);
  return mapped;
}
