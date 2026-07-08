export function textById(id: string, fallback = '') {
  return (document.getElementById(id)?.textContent || fallback).trim();
}

export function numericTextById(id: string) {
  const value = parseFloat(textById(id, '0'));
  return Number.isFinite(value) ? value : 0;
}

export function waitForPeakData(callback: () => void) {
  const start = () => {
    const el = document.getElementById('peakCPU');
    if (!el) {
      const timer = window.setTimeout(start, 300);
      return () => window.clearTimeout(timer);
    }

    const hasValue = () => /\d/.test((el.textContent || '').trim());
    if (hasValue()) {
      callback();
      return undefined;
    }

    const observer = new MutationObserver(() => {
      if (!hasValue()) return;
      observer.disconnect();
      callback();
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  };

  return start();
}
