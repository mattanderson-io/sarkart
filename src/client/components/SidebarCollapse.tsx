import { useEffect } from 'preact/hooks';

/**
 * Bootstrap-JS removal (Chunk 2): replaces `bootstrap.bundle.min.js` for the
 * one behavior the app actually used it for — the sidebar submenu collapses.
 *
 * The sidebar has six accordion togglers marked `data-bs-toggle="collapse"`
 * (Memory, Processes, Devices, Interface Traffic, Interface Errors, NFS).
 * Each points (via `href`, or `data-bs-target`) at a `<ul class="collapse">`
 * whose `data-bs-parent="#sidebar"` makes the group behave as an accordion:
 * opening one closes its siblings.
 *
 * `sarkart-v2.css` provides the actual `.collapse:not(.show){display:none}`
 * rule (ported from Bootstrap when the framework was dropped) and the caret/
 * `aria-expanded` styling, so this port only has to toggle the `.show` class
 * and keep `aria-expanded` in sync — no JS collapse library required. The per-CPU
 * `#ulCPU` list is force-hidden in CSS (chips render instead) and has no
 * toggler, so it is intentionally out of scope here.
 *
 * A single delegated click listener on `#sidebar` covers every toggler and
 * survives the dynamic submenus (device/interface lists) being re-rendered.
 */

function resolveTarget(toggler: Element): HTMLElement | null {
  const explicit = toggler.getAttribute('data-bs-target');
  const href = toggler.getAttribute('href');
  const selector = explicit && explicit !== '#' ? explicit : href;
  if (!selector || !selector.startsWith('#') || selector === '#') return null;
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function findToggler(target: HTMLElement): HTMLElement | null {
  const byTarget = document.querySelector<HTMLElement>(
    `#sidebar a[data-bs-toggle="collapse"][data-bs-target="#${CSS.escape(target.id)}"]`
  );
  if (byTarget) return byTarget;
  return document.querySelector<HTMLElement>(
    `#sidebar a[data-bs-toggle="collapse"][href="#${CSS.escape(target.id)}"]`
  );
}

function setExpanded(target: HTMLElement, expanded: boolean) {
  target.classList.toggle('show', expanded);
  const toggler = findToggler(target);
  if (toggler) {
    toggler.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    // Match Bootstrap's toggler state class so any CSS keyed on it still works.
    toggler.classList.toggle('collapsed', !expanded);
  }
}

function closeAccordionSiblings(target: HTMLElement) {
  const parentSelector = target.getAttribute('data-bs-parent');
  if (!parentSelector) return;
  const parent = document.querySelector(parentSelector);
  if (!parent) return;
  parent
    .querySelectorAll<HTMLElement>('.collapse.show')
    .forEach((sibling) => {
      if (sibling === target) return;
      if (sibling.getAttribute('data-bs-parent') !== parentSelector) return;
      setExpanded(sibling, false);
    });
}

function handleClick(event: MouseEvent) {
  const toggler = (event.target as Element | null)?.closest?.(
    'a[data-bs-toggle="collapse"]'
  );
  if (!toggler) return;

  const target = resolveTarget(toggler);
  if (!target) return;

  event.preventDefault();

  const willOpen = !target.classList.contains('show');
  if (willOpen) closeAccordionSiblings(target);
  setExpanded(target, willOpen);
}

export function SidebarCollapse() {
  useEffect(() => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.addEventListener('click', handleClick);
    return () => sidebar.removeEventListener('click', handleClick);
  }, []);

  return null;
}
