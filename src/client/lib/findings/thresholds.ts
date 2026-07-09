/**
 * The single tuning surface for the diagnostic engine.
 *
 * Every heuristic constant lives here with a rationale, so calibration later
 * (against a corpus of resolved-ticket SAR files — see the deferred section of
 * `docs/dashboard-redesign-plan.md`) is a constants change, not a refactor.
 *
 * Values are literature/rule-of-thumb starting points, NOT empirically
 * calibrated. Two safety biases are baked in:
 *   1. Tier boundaries round down — a run must clearly clear the "severe" bar to
 *      be Strong; otherwise it degrades to Moderate/Weak.
 *   2. Detectors require a signal to be *sustained*, not a single-sample blip,
 *      before it rises above Weak (see DURATION below).
 */

const MINUTE = 60_000;

/**
 * Duration gates, in ms. A breach run's covered duration is
 * (last - first sample) + one sample interval, so a lone sample counts as
 * roughly one interval of activity rather than "0 minutes".
 *
 * - SUSTAINED: at/above this a run is at least Moderate. Below it, Weak.
 * - SEVERE: combined with a severe magnitude, a run reaches Strong.
 */
export const DURATION = {
  sustainedMs: 15 * MINUTE,
  severeMs: 30 * MINUTE
};

/**
 * CPU %iowait — time the CPU was idle only because it was waiting on storage.
 * Sustained high iowait is the classic "the disk is the bottleneck" signal.
 * Rule of thumb: >20% sustained is worth investigating; >40% is severe.
 */
export const CPU_IOWAIT = {
  breachPct: 20,
  severePct: 40
};

/**
 * CPU %steal — time a VM was ready to run but the hypervisor gave the physical
 * CPU to someone else. Non-trivial steal means a noisy-neighbor / oversubscribed
 * host, which the customer cannot see from inside their guest. >5% sustained is
 * the common alert line; >15% is severe.
 */
export const CPU_STEAL = {
  breachPct: 5,
  severePct: 15
};

/**
 * Load average per CPU core. A load average roughly equal to the core count
 * means fully loaded; well above it means work is backing up in the run queue.
 * We use the 5-minute load average (ldavg-5) to ignore momentary spikes.
 * >1.5× cores sustained is elevated; >3× is severe.
 */
export const LOAD_PER_CORE = {
  breach: 1.5,
  severe: 3
};

/**
 * Memory commit — %commit is committed (promised) memory as a percentage of
 * RAM + swap. Linux overcommits, so >100% alone is not alarming; it becomes a
 * real pressure signal only when corroborated by actual swap-in activity (RAM
 * so tight the kernel is pulling pages back off disk). We therefore only raise a
 * memory finding when BOTH hold. >150% commit is severe.
 */
export const MEMORY_COMMIT = {
  breachPct: 100,
  severePct: 150,
  /** Minimum sustained swap-in rate (pages/s) that counts as corroboration. */
  swapInCorroborationPps: 1
};

/**
 * Swap activity — pages moved between RAM and the (far slower) swap area.
 * Sustained swap-in means the system is actively pulling working-set pages back
 * off disk to run; sustained swap-out means RAM is under real pressure. Any
 * sustained non-trivial rate is worth surfacing. >50 pages/s is severe.
 */
export const SWAP_ACTIVITY = {
  breachPps: 1,
  severePps: 50
};

/**
 * Disk saturation — a device is saturated when %util approaches 100% while
 * request latency (await) climbs. %util alone can mislead on SSDs/arrays that
 * service parallel requests, so we require elevated await during the same run.
 * >90% util is the breach line; >98% with high await is severe.
 */
export const DISK = {
  utilBreachPct: 90,
  utilSeverePct: 98,
  /** await (ms) that counts as "latency is climbing" corroboration. */
  awaitElevatedMs: 20,
  awaitSevereMs: 100
};

/**
 * Network errors/drops — on a healthy modern switched network these stay at
 * zero. A sustained non-zero rate (errors + drops + collisions, summed across
 * directions) points to a physical-layer fault or a host that cannot keep up.
 * We sum the error-class counters per sample. >10/s sustained is severe.
 */
export const NETWORK_ERRORS = {
  breachPerSec: 0.5,
  severePerSec: 10
};
