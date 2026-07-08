import { useEffect } from 'preact/hooks';
import { waitForPeakData } from '../lib/dom';

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value || '-';
  if (id === 'fileInfoName') el.title = value || '';
}

function populateFileInfo() {
  let host = '';
  let os = '';
  try { host = window.getHostname?.() || ''; } catch (_error) {}
  try { os = window.getOS?.() || ''; } catch (_error) {}

  const info = document.getElementById('dateFilterInfo');
  let dates = '-';
  if (info?.textContent && /\d/.test(info.textContent)) {
    dates = info.textContent.trim();
  } else if (Array.isArray(window._allDatesArr) && window._allDatesArr.length) {
    const parsedDates = window._allDatesArr;
    dates = parsedDates.length === 1
      ? parsedDates[0]
      : `${parsedDates[0]} - ${parsedDates[parsedDates.length - 1]} (${parsedDates.length} days)`;
  }

  const fileName = (document.querySelector('.fileinput-filename')?.textContent || '').trim() || '-';
  setText('fileInfoHost', host);
  setText('fileInfoOS', os);
  setText('fileInfoDates', dates);
  setText('fileInfoName', fileName);
}

function stripHostSuffix(value: string) {
  let host = '';
  try { host = (window.getHostname?.() || '').trim(); } catch (_error) {}
  if (!host) return value;
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`\\s+for\\s+${escaped}\\s*$`, 'i'), '');
}

function updateTitleVisibility() {
  const title = document.getElementById('pageTitle');
  const row = title?.closest?.('.contABlock.section-header');
  if (!title || !row) return;
  row.classList.toggle('title-empty', !(title.textContent || '').trim());
}

function showSpinner() {
  const spinner = document.getElementById('spinner');
  if (!spinner) return;
  spinner.classList.remove('d-none', 'hide');
  spinner.classList.add('d-block', 'show');
}

function markLoaded() {
  document.body.classList.add('data-loaded');
  populateFileInfo();
  const openAnother = document.getElementById('btnOpenAnother');
  if (openAnother) openAnother.style.display = '';
}

export function LandingBridge() {
  useEffect(() => {
    const processBtn = document.getElementById('btnProcessData');
    const stopProcessPropagation = (event: MouseEvent) => event.stopPropagation();
    processBtn?.addEventListener('click', stopProcessPropagation);

    const cleanupPeakWait = waitForPeakData(markLoaded);

    const pageTitle = document.getElementById('pageTitle');
    const titleObserver = pageTitle
      ? new MutationObserver(() => {
        const current = pageTitle.textContent || '';
        const fixed = stripHostSuffix(current);
        if (fixed !== current) pageTitle.textContent = fixed;
        updateTitleVisibility();
      })
      : null;
    if (pageTitle && titleObserver) {
      titleObserver.observe(pageTitle, { childList: true, characterData: true, subtree: true });
      updateTitleVisibility();
    }

    const systemInterval = window.setInterval(() => {
      const label = document.querySelector<HTMLElement>('.sidebar-section-system');
      if (!label) return;
      const anyVisible = ['btnSysCalls', 'btnTTY', 'btnFile'].some((id) => {
        const el = document.getElementById(id);
        return !!el && (el.classList.contains('show') || (!!el.style.display && el.style.display !== 'none'));
      });
      label.style.display = anyVisible ? '' : 'none';
    }, 1000);
    const systemTimer = window.setTimeout(() => window.clearInterval(systemInterval), 30000);

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;

      const openAnother = target?.closest?.('#btnOpenAnother');
      if (openAnother) {
        event.preventDefault();
        document.body.classList.remove('data-loaded');
        window.homePage?.();
        document.querySelector('.sar-file-uploader')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const trafficLink = target?.closest?.('#ulInterfaceTraffic a, #ulInterfaceErrors a') as HTMLAnchorElement | null;
      if (trafficLink) {
        const name = (trafficLink.textContent || '').trim();
        const section = trafficLink.closest('#ulInterfaceTraffic') ? 'Interface Traffic' : 'Interface Errors';
        const setInterfaceTitle = () => {
          const title = document.getElementById('pageTitle');
          if (title) title.textContent = `${section} - ${name}`;
        };
        window.setTimeout(setInterfaceTitle, 50);
        window.setTimeout(setInterfaceTitle, 400);
        return;
      }

      if (target?.closest?.('#btnSAR')) {
        window.setTimeout(() => {
          const title = document.getElementById('pageTitle');
          if (title && !(title.textContent || '').trim()) title.textContent = 'Dashboard';
          updateTitleVisibility();
        }, 100);
        return;
      }

      const peakArrow = target?.closest?.('#btnCPUArrow, #btnLoadArrow, #btnMemoryArrow') as HTMLElement | null;
      if (peakArrow) {
        event.preventDefault();
        if (peakArrow.id === 'btnCPUArrow') {
          const allCpu = Array.from(document.querySelectorAll<HTMLAnchorElement>('#ulCPU a[data-sns]'))
            .find((link) => (link.textContent || '').trim() === 'all');
          (allCpu || document.getElementById('btnCPUs'))?.click();
        } else if (peakArrow.id === 'btnLoadArrow') {
          document.getElementById('btnLoad')?.click();
        } else {
          (document.getElementById('btnMemUsg') || document.getElementById('btnMem'))?.click();
        }
        return;
      }

      const topLink = target?.closest?.('#sidebar ul.sidebar-nav > li > a');
      const subLink = target?.closest?.('#sidebar ul.sidebar-nav ul a');
      if (topLink || subLink) {
        document.querySelectorAll('#sidebar ul.sidebar-nav > li').forEach((item) => item.classList.remove('active'));
        const activeItem = topLink?.closest('li') || subLink?.closest('ul.sidebar-nav > li');
        activeItem?.classList.add('active');
        return;
      }

      const sample = target?.closest?.('#btnTrySample');
      if (sample) {
        event.preventDefault();
        showSpinner();
        window.updateProgress?.(5, 'Downloading sample data...');
        fetch('/sample/sample-sar.txt')
          .then((res) => {
            if (!res.ok) throw new Error('Sample file not found');
            return res.text();
          })
          .then((text) => {
            window.updateProgress?.(15, 'Loading sample data...');
            const fileName = document.querySelector('.fileinput-filename');
            if (fileName) fileName.textContent = 'sample-sar.txt (built-in sample)';
            window.file = true;
            window._pendingResult = { target: { result: text } };
            window.updateProgress?.(100, 'File loaded - ready to process');
            const btn = document.getElementById('btnProcessData');
            if (btn) {
              btn.hidden = false;
              btn.style.display = '';
              window.setTimeout(() => {
                if (window.sarkartProcessPendingData) {
                  window.sarkartProcessPendingData();
                } else {
                  btn.click();
                }
              }, 300);
            }
          })
          .catch((error) => {
            console.error('[SARkart] Failed to load sample:', error);
            window.updateProgress?.(0, 'Failed to load sample data');
          });
      }
    };

    document.addEventListener('click', onClick);

    const originalDisplayTitle = window.displayTitle;
    if (originalDisplayTitle && !window.__displayTitleWrapped) {
      window.displayTitle = function displayTitleWithoutHost(title: string) {
        const result = originalDisplayTitle.apply(this, [title]);
        const el = document.getElementById('pageTitle');
        if (el) el.textContent = stripHostSuffix(el.textContent || '');
        return result;
      };
      window.__displayTitleWrapped = true;
    }

    return () => {
      processBtn?.removeEventListener('click', stopProcessPropagation);
      if (typeof cleanupPeakWait === 'function') cleanupPeakWait();
      titleObserver?.disconnect();
      window.clearInterval(systemInterval);
      window.clearTimeout(systemTimer);
      document.removeEventListener('click', onClick);
      if (originalDisplayTitle && window.displayTitle !== originalDisplayTitle) {
        window.displayTitle = originalDisplayTitle;
        window.__displayTitleWrapped = false;
      }
    };
  }, []);

  return null;
}
