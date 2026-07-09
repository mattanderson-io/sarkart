/**
 * Navigate from a finding to the chart that proves it.
 *
 * Opens the most specific relevant page by simulating the same nav clicks a
 * user would make (the technique the PDF exporter uses), so every bound handler
 * — chart render + dashboard/view toggle — fires naturally.
 *
 * For multi-day captures, the finding's day is first selected in the existing
 * Date Range filter, so the chart that opens is scoped to the day the finding
 * occurred rather than the whole capture. (No in-chart zoom — the day filter is
 * the agreed granularity.)
 */
import { getDates } from '../sarStore.ts';
import type { Finding } from './types.ts';

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
 * The capture date string (as stored in `getDates()`) that a finding's start
 * falls on, matched by calendar fields so it is robust to zero-padding / year
 * format. Timestamps are UTC-encoded capture wall-clock (see sarData), so read
 * UTC fields. Returns null if no capture date matches.
 */
export function findingDayString(startMs: number): string | null {
  const d = new Date(startMs);
  const year = d.getUTCFullYear() % 100;
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  for (const ds of getDates()) {
    const parts = ds.split('/');
    if (parts.length !== 3) continue;
    if (Number(parts[0]) === month && Number(parts[1]) === day && Number(parts[2]) % 100 === year) return ds;
  }
  return null;
}

function openTarget(finding: Finding): boolean {
  const target = finding.chartTarget;
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
}

/**
 * Open the chart page for a finding. On multi-day captures, scope the date
 * filter to the finding's day first (awaiting the re-slice so the chart renders
 * the right day's data), then navigate. Returns whether navigation succeeded.
 */
export async function navigateToFinding(finding: Finding): Promise<boolean> {
  if (getDates().length > 1) {
    const day = findingDayString(finding.start);
    if (day) {
      try {
        await window.sarkartApplyDay?.(day);
      } catch (error) {
        console.warn('[SARkart] date-filter scoping failed:', error);
      }
    }
  }
  return openTarget(finding);
}
