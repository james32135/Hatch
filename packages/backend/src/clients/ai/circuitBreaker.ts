/**
 * Per-provider circuit breaker with automatic recovery after cooldown.
 */
export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private openUntil = 0;
  private state: CircuitState = "closed";

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  getName(): string {
    return this.name;
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const readyAt = this.openUntil || this.openedAt + this.cooldownMs;
      if (Date.now() >= readyAt) {
        this.state = "half-open";
      }
    }
    return this.state;
  }

  allow(): boolean {
    const s = this.getState();
    return s === "closed" || s === "half-open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold || this.state === "half-open") {
      this.trip(this.cooldownMs);
    }
  }

  /**
   * Force-open the circuit for a custom cooldown (e.g. provider 429 / TPD).
   */
  trip(cooldownMs?: number): void {
    const ms = Math.max(1_000, cooldownMs ?? this.cooldownMs);
    this.state = "open";
    this.openedAt = Date.now();
    this.openUntil = this.openedAt + ms;
  }

  snapshot() {
    return {
      name: this.name,
      state: this.getState(),
      failures: this.failures,
      openedAt: this.openedAt || null,
      openUntil: this.openUntil || null,
    };
  }
}
