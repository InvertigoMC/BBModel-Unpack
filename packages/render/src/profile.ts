import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Throwaway userData directory for the isolated Blockbench instance.
 * Keeps the user's real Blockbench profile (state, settings, models) untouched.
 */
export class TempProfile {
	#dir: string | undefined;

	get dir(): string {
		if (!this.#dir) throw new Error('TempProfile not initialized');
		return this.#dir;
	}

	async create(): Promise<void> {
		this.#dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bbmodel-render-'));
	}

	/** Remove the profile directory. Logs failures instead of throwing (best effort). */
	async dispose(logger?: { warn: (message: string) => void }): Promise<void> {
		if (!this.#dir) return;
		const dir = this.#dir;
		this.#dir = undefined;
		// Best effort: Chromium may still be flushing files for a moment after exit.
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
				await fs.rm(dir, { recursive: true, force: true });
				return;
			} catch (err) {
				if (attempt === 2 && logger) {
					logger.warn(`Could not remove temporary Blockbench profile ${dir}: ${String(err)}`);
				}
			}
		}
	}
}
