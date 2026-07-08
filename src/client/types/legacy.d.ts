export {};

declare global {
  interface Window {
    _idx?: Record<string, string[]>;
    _firstLine?: string;
    _fullIdx?: Record<string, string[]>;
    _filterByDates?: (dates: string[] | null) => void;
    _dateFilterRefresh?: (dates: string[] | null, info: string) => void;
    _cpuByCore?: Record<string, string[]>;
    headers?: string[];
    _allDatesArr?: string[];
    Plotly?: {
      newPlot: (el: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => void;
      purge?: (el: HTMLElement) => void;
      relayout?: (el: HTMLElement, patch: Record<string, unknown>) => void;
    };
    printMultiChart?: (containerId: string, title: string, yAxisTitle: string, yTickInterval: unknown, series: LegacySeries[]) => void;
    printPieChart?: (containerId: string, value: number, color: string) => void;
    __sarkartUnitsWrapped?: boolean;
    sarkartRefreshHeatmaps?: () => void;
    sarkartNetUnit?: {
      get: () => string;
      convertKBs: (kbs: number) => { value: number; suffix: string };
      suffix: () => string;
    };
    chartPage?: () => void;
    homePage?: () => void;
    showBlock?: (id: string) => void;
    hideBlock?: (id: string) => void;
    show?: (selector: string) => void;
    updateProgress?: (percent: number, message?: string) => void;
    progressBarReset?: () => void;
    displayTitle?: (title: string) => unknown;
    getKernel?: () => string;
    file?: unknown;
    _pendingResult?: { target: { result: string } };
    html2canvas?: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    jspdf?: {
      jsPDF: new (orientation: string, unit: string, format: string) => unknown;
    };
    sarkartGeneratePDFReport?: () => Promise<void>;
    sarkartProcessPendingData?: () => Promise<void>;
    sarkartHideChartHead?: (containerId: string) => void;
    getHostname?: () => string;
    getOS?: () => string;
    getServerInfo?: () => void;
    grepHeaders?: (pattern: string) => string | -1;
    getGenericData?: (key: string, column: number, table: 'yes' | 'no', target: string | null) => LegacyPoint[];
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
