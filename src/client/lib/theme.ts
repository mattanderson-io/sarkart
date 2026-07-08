export type Theme = 'dark' | 'light';

const themeKey = 'sarkart-theme';
const themeCookieMaxAge = 60 * 60 * 24 * 365;

export function readThemeCookie(): Theme | null {
  const match = document.cookie.match(/(?:^|;\s*)sarkart-theme=(light|dark)(?:;|$)/);
  return match ? (match[1] as Theme) : null;
}

export function writeThemeCookie(theme: Theme) {
  document.cookie = `${themeKey}=${theme}; path=/; max-age=${themeCookieMaxAge}; SameSite=Lax`;
}

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  writeThemeCookie(theme);
  try {
    localStorage.setItem(themeKey, theme);
  } catch (_error) {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  window.dispatchEvent(new CustomEvent('sarkart-theme-change', { detail: { theme } }));
}

export function initTheme() {
  let saved = readThemeCookie();

  if (!saved) {
    try {
      const stored = localStorage.getItem(themeKey);
      saved = stored === 'light' || stored === 'dark' ? stored : null;
    } catch (_error) {
      saved = null;
    }

    if (saved) writeThemeCookie(saved);
  }

  setTheme(saved || 'dark');
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}
