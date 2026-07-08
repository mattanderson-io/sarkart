import { useEffect } from 'preact/hooks';

/**
 * Click-to-toggle behaviour for the "i" info buttons in each chart header.
 *
 * The button + popover markup lives in `Content.tsx` (`ChartBlock`) and its
 * content is populated per chart by `sarEngine.setChartInfo` (driven from
 * `ChartRouterBridge`). This bridge only wires the interaction: one delegated
 * click listener opens the clicked chart's popover (closing any other), a
 * click anywhere else closes it, and Escape closes it too. Mirrors the
 * top-bar menu pattern in `Content.tsx`'s `TopBar`.
 */

function closeAllPopovers() {
  document.querySelectorAll<HTMLElement>('.chart-info-pop').forEach((pop) => {
    pop.hidden = true;
  });
  document.querySelectorAll<HTMLElement>('.chart-info-btn').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });
}

export function ChartInfoBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const btn = target?.closest?.('.chart-info-btn') as HTMLElement | null;

      if (btn) {
        event.preventDefault();
        event.stopPropagation();
        const pop = btn.closest('.chart-head')?.querySelector<HTMLElement>('.chart-info-pop') || null;
        const willOpen = !!pop && pop.hidden;
        closeAllPopovers();
        if (pop && willOpen) {
          pop.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      // A click anywhere outside an open popover dismisses it. Clicks inside
      // the popover (e.g. selecting text) are left alone.
      if (!target?.closest?.('.chart-info-pop')) closeAllPopovers();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAllPopovers();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return null;
}
