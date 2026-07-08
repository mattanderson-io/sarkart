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
    // Reading occupies only the first ~20% of the overall bar; parsing/render
    // own the rest (SarDataBridge.processPendingResult starts at 25%). Scaling
    // here keeps the bar moving forward instead of racing to 100% during the
    // read and then snapping back to 25% when parsing begins.
    window.updateProgress?.(Math.round(percent * 0.2), 'Reading file...');
  };
  reader.onload = (event) => {
    window.file = true;
    window._pendingResult = { target: { result: String(event.target?.result ?? '') } };
    // End of the read segment (~22%), just below where parsing takes over at
    // 25% — keeps the bar monotonic into processPendingResult.
    window.updateProgress?.(22, 'File loaded — ready to process');
    if (processButton) {
      processButton.hidden = false;
      processButton.style.display = '';
    }
    // Auto-advance into parsing/render, mirroring the "Try with sample data"
    // path in LandingBridge. Without this the upload path stalls at
    // "File loaded — ready to process" (progress pinned at 100%, the stepper
    // showing RENDERING) and only moves on if the user manually clicks
    // "Process data" — which reads as "stuck on render". The button stays
    // revealed as a fallback in case the processor hasn't mounted yet.
    window.setTimeout(() => {
      if (window.sarkartProcessPendingData) {
        void window.sarkartProcessPendingData();
      } else if (processButton) {
        processButton.click();
      }
    }, 300);
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
 * Wires drag-and-drop and click-to-browse on `.sar-file-uploader`, plus a
 * hidden `<input type=file>` for the browse path. The legacy engine's
 * `makeDroppable` that used to own this (and the elaborate clone-and-race
 * dance previously needed to take over from it) has been removed, so this
 * installs cleanly on mount.
 *
 * The click handler skips events targeting `#btnProcessData` (a Preact-
 * owned button nested inside the dropzone with its own onClick) so opening
 * the file picker never swallows the "Process data" click.
 */
function install(dropzone: HTMLElement) {
  if (dropzone.dataset.sarkartRouted === 'true') return;
  dropzone.dataset.sarkartRouted = 'true';

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

export function FileUploadBridge() {
  useEffect(() => {
    const dropzone = document.querySelector<HTMLElement>('.sar-file-uploader');
    if (dropzone) install(dropzone);
    return () => {
      if (dropzone) delete dropzone.dataset.sarkartRouted;
    };
  }, []);

  return null;
}
