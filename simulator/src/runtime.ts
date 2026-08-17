import {
  SIMULATOR_SCENARIOS,
  sendTelemetryTick,
  type SendResult,
  type SimulatorConfig,
  type SimulatorScenario,
} from './telemetry.js';

export interface SimulatorRuntimeState {
  configured: boolean;
  running: boolean;
  scenario: SimulatorScenario;
  intervalMs: number;
  tick: number;
  lastRunAt: string | null;
  lastResults: SendResult[];
}

export class SimulatorRuntime {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private scenario: SimulatorScenario;
  private intervalMs: number;
  private tick = 0;
  private lastRunAt: string | null = null;
  private lastResults: SendResult[] = [];

  constructor(private readonly config: SimulatorConfig | null) {
    this.scenario = config?.scenario ?? 'normal';
    this.intervalMs = config?.intervalMs ?? 60_000;
  }

  getState(): SimulatorRuntimeState {
    return {
      configured: this.config !== null,
      running: this.running,
      scenario: this.scenario,
      intervalMs: this.intervalMs,
      tick: this.tick,
      lastRunAt: this.lastRunAt,
      lastResults: this.lastResults,
    };
  }

  start(scenario: SimulatorScenario = this.scenario, intervalMs = this.intervalMs) {
    if (!this.config) throw new Error('Simulator telemetry is not configured');
    if (!SIMULATOR_SCENARIOS.includes(scenario)) throw new Error('Unknown simulator scenario');
    if (!Number.isFinite(intervalMs) || intervalMs < 1_000 || intervalMs > 300_000) {
      throw new Error('Simulation interval must be between 1000 and 300000 milliseconds');
    }

    this.stop();
    this.scenario = scenario;
    this.intervalMs = intervalMs;
    this.tick = 0;
    this.running = true;
    void this.runTick();
    this.timer = setInterval(() => void this.runTick(), intervalMs);
    return this.getState();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
    return this.getState();
  }

  private async runTick() {
    if (!this.config || !this.running) return;
    try {
      this.lastResults = await sendTelemetryTick(
        { ...this.config, scenario: this.scenario, intervalMs: this.intervalMs },
        this.tick,
      );
      this.tick += 1;
      this.lastRunAt = new Date().toISOString();
      const accepted = this.lastResults.filter((result) => result.accepted).length;
      const skipped = this.lastResults.filter((result) => result.skipped).length;
      console.log(
        `Simulator ${this.scenario} tick accepted ${accepted}/${this.lastResults.length} device batches, skipped ${skipped}`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Simulator telemetry tick failed');
    }
  }
}
