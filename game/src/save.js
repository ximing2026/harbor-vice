// Save / continue via localStorage. Guarded so Node (no localStorage) is safe.
export const SAVE_KEY = 'harbor-vice.save.v1';

export function loadSave() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function writeSave(data) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}
