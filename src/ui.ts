export const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string) {
  const node = el('toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), 4500);
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : '처리하지 못했어요. 다시 시도해 주세요.';
}
