export {};

declare global {
  interface Window {
    Plotly?: {
      newPlot: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => void;
      purge?: (el: HTMLElement) => void;
      relayout?: (el: HTMLElement, patch: Record<string, unknown>) => void;
    };
    printChart?: (containerId: string, yMin: number | null, yMax: number | null, yAxisTitle: string, yTickInterval: unknown, color: string, data: LegacyPoint[]) => void;
    printMultiChart?: (containerId: string, title: string, yAxisTitle: string, yTickInterval: unknown, series: LegacySeries[]) => void;
    printPieChart?: (containerId: string, value: number, color: string) => void;
    __sarkartUnitsWrapped?: boolean;
    sarkartRefreshHeatmaps?: () => void;
    sarkartNetUnit?: {
      get: () => string;
      convertKBs: (kbs: number) => { value: number; suffix: string };
      suffix: () => string;
    };
    // Decorated in place (legacyUi wraps chartPage/updateProgress;
    // LandingBridge wraps displayTitle), so these stay on window; every other
    // former engine primitive is now a direct import from lib/sarEngine.
    chartPage?: () => void;
    updateProgress?: (percent: number, message?: string) => void;
    displayTitle?: (title: string) => unknown;
    file?: unknown;
    _pendingResult?: { target: { result: string } };
    html2canvas?: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: new (orientation: string, unit: string, format: string) => unknown;
    };
    sarkartGeneratePDFReport?: () => Promise<void>;
    sarkartProcessPendingData?: () => Promise<void>;
    getDevices?: (key: string, table: 'yes' | 'no', target: string | null) => void;
    getInterfaceTraffic?: (key: string, table: 'yes' | 'no', target: string | null) => void;
    getInterfaceErrors?: (key: string, table: 'yes' | 'no', target: string | null) => void;
    getCPUchart?: (id: string) => void;
    ai?: {
      languageModel?: {
        availability: () => Promise<string>;
        create: (options: { systemPrompt: string }) => Promise<{
          prompt: (prompt: string) => Promise<string>;
          destroy: () => void;
        }>;
      };
    };
  }

  type LegacyPoint = [number, number | null | undefined];

  type LegacySeries = {
    name?: string;
    data?: LegacyPoint[];
  };
}
