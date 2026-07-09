/**
 * Navigate from a finding to the chart that proves it.
 *
 * Phase 2 opens the most specific relevant page by simulating the same nav
 * clicks a user would make (the technique the PDF exporter uses), so every
 * bound handler — chart render + dashboard/view toggle — fires naturally.
 * Phase 3 will layer "zoom to the finding's window" on top via Plotly.relayout;
 * the seam is marked below.
 */
import type { ChartTarget } from './types.ts';

function clickById(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.click();
  return true;
}

/** Click the submenu `<a>` inside `listId` whose visible text matches `label`. */
function clickListItem(listId: string, label: string): boolean {
  const list = document.getElementById(listId);
  if (!list) return false;
  const links = Array.from(list.querySelectorAll<HTMLAnchorElement>('a'));
  const match = links.find((a) => (a.textContent || '').trim() === label);
  if (!match) return false;
  match.click();
  return true;
}

/**
 * Open the chart page for a finding's target. Returns true if navigation
 * succeeded (the target page/element existed).
 */
export function navigateToFinding(target: ChartTarget): boolean {
  switch (target.kind) {
    case 'cpu':
      // The CPU per-core list is built on the dashboard; click the core's item.
      return clickListItem('ulCPU', target.coreId);
    case 'sidebar':
      return clickById(target.buttonId);
    case 'device':
      return clickListItem('ulDev', target.deviceId);
    case 'interfaceError':
      return clickListItem('ulInterfaceErrors', target.interfaceId);
    default:
      return false;
  }
  // Phase 3: after the render settles, Plotly.relayout the container's x-axis to
  // [finding.start − pad, finding.end + pad] to land zoomed on the evidence.
}
