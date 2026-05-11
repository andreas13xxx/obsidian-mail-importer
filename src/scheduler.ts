// Phase 7: Scheduler – Intervall-Verwaltung
// T-18: SyncScheduler [F-12, F-13, NF-04]

/**
 * Manages the periodic sync interval.
 * Returns timer IDs so main.ts can register them via this.registerInterval().
 */
export class SyncScheduler {
	private timerId: number | null = null;

	/**
	 * T-18.2: Starts a periodic timer.
	 * Returns the timer ID for registration via Plugin.registerInterval(),
	 * or null if intervalMinutes is 0 (manual-only mode).
	 * [F-12, NF-04]
	 */
	start(intervalMinutes: number, callback: () => void): number | null {
		// T-18.5: Interval 0 → no timer, return null [F-13]
		if (intervalMinutes <= 0) {
			return null;
		}

		const intervalMs = intervalMinutes * 60 * 1000;
		this.timerId = window.setInterval(callback, intervalMs);
		return this.timerId;
	}

	/**
	 * T-18.3: Stops the current timer.
	 * [NF-04]
	 */
	stop(): void {
		if (this.timerId !== null) {
			window.clearInterval(this.timerId);
			this.timerId = null;
		}
	}

	/**
	 * T-18.4: Restarts the timer with a new interval.
	 * Stops the current timer first, then starts a new one.
	 * Returns the new timer ID or null.
	 */
	restart(intervalMinutes: number, callback: () => void): number | null {
		this.stop();
		return this.start(intervalMinutes, callback);
	}
}
