import { useEffect, useState } from 'preact/hooks';
import { cpuAll, cpuCount, hostInfo, metricStats } from '../lib/sarStats';
import { numericTextById, textById, waitForPeakData } from '../lib/dom';

const thresholds = {
  cpuHigh: 80,
  cpuCritical: 95,
  memHigh: 80,
  memCritical: 95,
  loadHighPerCore: 2
};

function fmt(value: number) {
  return typeof value === 'number' ? value.toFixed(1) : '—';
}

function pluralize(value: number, word: string) {
  return `${value} ${word}${value === 1 ? '' : 's'}`;
}

function generateSummary() {
  const sentences: string[] = [];
  const info = hostInfo();
  const hostname = info.hostname || 'this server';

  let intro = `Performance analysis for ${hostname}`;
  if (info.os) intro += ` (${info.os})`;
  if (info.days > 1) intro += ` covering ${pluralize(info.days, 'day')}`;
  else if (info.days === 1) intro += ' for a single day';
  intro += '.';
  sentences.push(intro);

  const peakCPU = numericTextById('peakCPU');
  const peakCPUTime = textById('peakCPUTime');
  const cpuStats = metricStats('CPU-%usr', 3, { threshold: thresholds.cpuHigh, filter: cpuAll });

  if (cpuStats) {
    if (peakCPU >= thresholds.cpuCritical) {
      sentences.push(`CPU reached a critical peak of ${peakCPU}%${peakCPUTime ? ` at ${peakCPUTime}` : ''}. Average utilization was ${fmt(cpuStats.mean)}% with a p95 of ${fmt(cpuStats.p95)}%.`);
    } else if (peakCPU >= thresholds.cpuHigh) {
      sentences.push(`CPU peaked at ${peakCPU}%${peakCPUTime ? ` at ${peakCPUTime}` : ''}, elevated but not critical. Average was ${fmt(cpuStats.mean)}%.`);
    } else {
      sentences.push(`CPU utilization remained healthy, peaking at only ${peakCPU}% with an average of ${fmt(cpuStats.mean)}%.`);
    }

    if (cpuStats.highCount > 0) {
      const pctHigh = ((cpuStats.highCount / cpuStats.count) * 100).toFixed(0);
      if (Number(pctHigh) > 20) {
        sentences.push(`CPU was above ${thresholds.cpuHigh}% for approximately ${pctHigh}% of all readings — indicating sustained pressure.`);
      } else if (Number(pctHigh) > 5) {
        sentences.push(`CPU exceeded ${thresholds.cpuHigh}% in about ${pctHigh}% of readings — occasional spikes but not sustained.`);
      }
    }
  }

  const peakMem = numericTextById('peakMemory');
  if (peakMem) {
    if (peakMem >= thresholds.memCritical) sentences.push(`Memory utilization hit ${peakMem}%, critically high — potential OOM risk.`);
    else if (peakMem >= thresholds.memHigh) sentences.push(`Memory peaked at ${peakMem}% — elevated but within operational bounds.`);
    else sentences.push(`Memory usage was comfortable, peaking at ${peakMem}%.`);
  }

  const peakLoad = numericTextById('peakLoad');
  if (peakLoad) {
    const cores = cpuCount();
    const loadPerCore = peakLoad / Math.max(cores, 1);
    if (loadPerCore >= thresholds.loadHighPerCore) {
      sentences.push(`System load peaked at ${peakLoad} (${fmt(loadPerCore)} per core across ${cores} cores), suggesting run queue saturation.`);
    } else {
      sentences.push(`System load remained manageable at a peak of ${peakLoad} across ${cores} cores.`);
    }
  }

  let issues = 0;
  if (peakCPU >= thresholds.cpuHigh) issues++;
  if (peakMem >= thresholds.memHigh) issues++;
  if (peakLoad / Math.max(cpuCount(), 1) >= thresholds.loadHighPerCore) issues++;

  if (issues === 0) sentences.push('Overall, this server appears healthy with no significant resource pressure detected.');
  else if (issues === 1) sentences.push('One area of concern was identified — review the highlighted metric for optimization opportunities.');
  else sentences.push(`Multiple resource pressure points detected (${issues} metrics exceeded thresholds). Investigation into workload distribution or capacity planning is recommended.`);

  return sentences.join(' ');
}

function buildStatsContext() {
  const info = hostInfo();
  const cpuStats = metricStats('CPU-%usr', 3, { threshold: thresholds.cpuHigh, filter: cpuAll });
  const lines = [
    `Host: ${info.hostname || 'Unknown'}`,
    `OS: ${info.os || 'Unknown'}`,
    `Days of data: ${info.days}`,
    `Peak CPU: ${textById('peakCPU', '—')}% at ${textById('peakCPUTime', '—')}`,
    `Peak Memory: ${textById('peakMemory', '—')}%`,
    `Peak Load: ${textById('peakLoad', '—')}`,
    `CPU cores: ${cpuCount()}`
  ];

  if (cpuStats) {
    lines.push(`CPU mean: ${fmt(cpuStats.mean)}%, p50: ${fmt(cpuStats.p50)}%, p95: ${fmt(cpuStats.p95)}%, max: ${fmt(cpuStats.max)}%`);
    lines.push(`CPU readings above 80%: ${cpuStats.highCount} out of ${cpuStats.count} (${((cpuStats.highCount / cpuStats.count) * 100).toFixed(1)}%)`);
  }

  return lines.join('\n');
}

async function tryAISummary(statsContext: string) {
  try {
    if (!window.ai?.languageModel) return null;
    const availability = await window.ai.languageModel.availability();
    if (availability === 'unavailable' || availability === 'downloadable' || availability === 'downloading') return null;

    const session = await window.ai.languageModel.create({
      systemPrompt: 'You are a Unix systems performance analyst. Given SAR (System Activity Report) metrics, provide a concise 3-4 sentence performance summary. Be specific about numbers. Mention any concerns and whether the server appears healthy. Do not use markdown formatting.'
    });
    const result = await session.prompt(`Analyze this server performance data and provide a brief summary:\n\n${statsContext}`);
    session.destroy();
    return result;
  } catch (error) {
    console.log('[SARkart] Chrome AI unavailable:', error);
    return null;
  }
}

export function AiSummary() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [badge, setBadge] = useState('');

  useEffect(() => waitForPeakData(() => {
    setText(generateSummary());
    setVisible(true);
    void tryAISummary(buildStatsContext()).then((result) => {
      if (!result?.trim()) return;
      setText(result.trim());
      setBadge('Gemini Nano');
    });
  }), []);

  if (!visible) return null;

  return (
    <div id="aiSummaryPanel" className="ai-summary-panel homeContBlock">
      <div className="ai-summary-header">
        <span className="ai-summary-icon"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l3 7-9 11L3 10z" /><path d="M12 3v18" /></svg></span>
        <span className="ai-summary-title">Performance Summary</span>
        {badge ? <span className="ai-summary-badge">{badge}</span> : null}
        <button className="ai-summary-close" title="Dismiss" aria-label="Dismiss summary" onClick={() => setVisible(false)}>&times;</button>
      </div>
      <div className="ai-summary-body">
        <p className="ai-summary-text">{text}</p>
      </div>
    </div>
  );
}
