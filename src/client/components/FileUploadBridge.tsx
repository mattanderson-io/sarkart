import { useEffect } from 'preact/hooks';

/**
 * Sub-step 3 of Chunk 2 (retiring the legacy engine): takes real file
 * upload — drag-and-drop plus the "Browse and upload" button — off
 * `sarkart-v1.0.0.min.js`. Mirrors the "Try with sample data" flow already
 * implemented in LandingBridge (populate window._pendingResult, drive
 * updateProgress, reveal #btnProcessData) instead of the legacy engine's
 * jQuery FileReader dance (getAsText/errorHandler/makeDroppable).
 *
 * Legacy behaviors intentionally NOT ported (dead in the v2 template):
 * - #fileErr / #pageTitle / #containerA-C clearing on file select — those
 *   elements either don't exist (#fileErr) or get cleared by chartPage()
 *   on the next navigation anyway.
 * - The .btn-file / fileselect jQuery custom-event plumbing — v2's upload
 *   button has no <input type=file> sibling for that flow to attach to;
 *   file selection goes through the hidden input this component creates
 *   (mirroring makeDroppable's approach) instead.
 */

function showSpinner() {
  const spinner = document.getElementById('spinner');
  if (!spinner) return;
  spinner.classList.remove('d-none', 'hide');
  spinner.classList.add('d-block', 'show');
}

/**
 * Port of the legacy `getAsText(file)`: reads a File via FileReader with
 * progress callbacks into `window._pendingResult`, matching the exact
 * shape LandingBridge's sample-data path and SarDataBridge's
 * `processPendingResult` already expect (`{ target: { result } }`).
 */
function readFileAsText(file: File) {
  showSpinner();
  window.updateProgress?.(0, 'Uploading file...');
  const processButton = document.getElementById('btnProcessData') as HTMLButtonElement | null;
  if (processButton) {
    processButton.hidden = true;
    processButton.style.display = 'none';
  }

  const reader = new FileReader();
  reader.onprogress = (event) => {
    if (!event.lengthComputable) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    window.updateProgress?.(percent, 'Reading file...');
  };
  reader.onload = (event) => {
    window.file = true;
    window._pendingResult = { target: { result: String(event.target?.result ?? '') } };
    window.updateProgress?.(100, 'File loaded — ready to process');
    if (processButton) {
      processButton.hidden = false;
      processButton.style.display = '';
    }
  };
  reader.onerror = () => {
    console.error('[SARkart] Failed to read file');
    window.updateProgress?.(0, 'Error reading file...');
  };
  reader.readAsText(file, 'UTF-8');
}

function handleFileSelected(file: File) {
  const fileName = document.querySelector('.fileinput-filename');
  if (fileName) fileName.textContent = file.name;
  readFileAsText(file);
}

/**
 * `sarkart-v1.0.0.min.js` calls `makeDroppable(document.querySelector(
 * '.sar-file-uploader'), ...)` in its own `$(document).ready` block, which
 * attaches its own dragover/dragleave/drop/click listeners (plus its own
 * hidden `<input type=file>` child) to this same element — the same
 * double-handler hazard fixed for chart nav takeovers and the date filter
 * UI. Must be called via `deferredInstall` below, after that binding has
 * happened (see its doc comment for the exact ordering).
 *
 * `.sar-file-uploader` can't be cloned-and-replaced wholesale like the nav
 * links: it contains `#btnProcessData`, whose "Process data" click
 * handler is a real Preact `onClick` prop (an actual DOM listener Preact
 * attaches directly to that node, not something jQuery bound). Cloning
 * the subtree would silently drop that listener along with the legacy
 * one. So `#btnProcessData` is detached before cloning and reattached
 * (as the *original*, Preact-owned node — not a clone) to the new
 * dropzone afterward, dropping the legacy engine's listeners on every
 * other part of the subtree while preserving Preact's on this one.
 */
function install() {
  const existing = document.querySelector<HTMLElement>('.sar-file-uploader');
  if (!existing || existing.dataset.sarkartRouted === 'true') return;

  const processButton = existing.querySelector('#btnProcessData');
  const processButtonParent = processButton?.parentElement ?? null;
  const processButtonNextSibling = processButton?.nextSibling ?? null;
  if (processButton) processButton.remove();

  const dropzone = existing.cloneNode(true) as HTMLElement;
  existing.replaceWith(dropzone);
  dropzone.dataset.sarkartRouted = 'true';

  if (processButton && processButtonParent) {
    // processButtonParent is a node from the OLD subtree (now detached);
    // find its counterpart in the new clone by id chain would be
    // overkill — #progressContainer is unique enough to re-locate directly.
    const newParent = dropzone.querySelector('#progressContainer');
    if (newParent) {
      const before = processButtonNextSibling && newParent.contains(processButtonNextSibling)
        ? processButtonNextSibling
        : null;
      newParent.insertBefore(processButton, before);
    }
  }

  // By the time this runs, makeDroppable has typically already executed
  // (its $(document).ready callback fires synchronously once the script
  // finishes evaluating, before this component's 'legacy-engine-loaded'
  // handler runs) and appended its own hidden <input type=file> to the
  // original dropzone. cloneNode(true) above copied that input along
  // with everything else — strip it so only our own input remains.
  dropzone.querySelectorAll('input[type="file"]').forEach((el) => el.remove());

  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  dropzone.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFileSelected(file);
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFileSelected(file);
  });
  dropzone.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest?.('#btnProcessData') || target === input) return;
    input.value = '';
    input.click();
  });
}

function deferredInstall() {
  // sarkart-v1.0.0.min.js's `$(document).ready(fn)` call, made while
  // document.readyState is already "complete" (LegacyScripts injects it
  // well after page load), defers `fn` — which includes the
  // makeDroppable(...) call — via a macrotask (jQuery's ready mechanism
  // falls back to setTimeout in that case). That macrotask is scheduled
  // synchronously during the script's evaluation, i.e. strictly *before*
  // the script's `onload` fires. Our `sarkart:legacy-engine-loaded`
  // listener runs off that same `onload`, so calling install() directly
  // from it would run *before* makeDroppable — cloning the dropzone too
  // early and leaving the legacy listeners to bind onto our clone
  // afterward. Wrapping in our own setTimeout here registers a macrotask
  // *after* jQuery's already-queued one, so it reliably runs once
  // makeDroppable has finished binding to the original element — which
  // install()'s clone-and-replace then discards. Verified empirically:
  // without this wrapper the cloned dropzone ends up with two file
  // inputs (ours + the legacy one bound after our clone).
  window.setTimeout(install, 0);
}

export function FileUploadBridge() {
  useEffect(() => {
    window.addEventListener('sarkart:legacy-engine-loaded', deferredInstall);
    return () => window.removeEventListener('sarkart:legacy-engine-loaded', deferredInstall);
  }, []);

  return null;
}
