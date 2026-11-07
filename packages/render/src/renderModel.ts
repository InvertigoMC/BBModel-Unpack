import { ChildProcess, spawn } from 'node:child_process';
import * as net from 'node:net';
import { Cdp, CdpError } from './cdp';
import { fitBoxToCamera, paddingIncreaseForMargins, validateBox } from './framing';
import { decodePNG } from './png';
import { TempProfile } from './profile';
import {
	BBox,
	Logger,
	RenderRequest,
	RenderResult,
	VerifyOptions,
} from './types';
import { classify, verifyImage, VerifyOutcome } from './verify';
import { BUILD_BBOX_SCRIPT, buildLoadScript, buildProbeScript, buildRenderScript, RenderScriptParams } from './pageScript';

export interface BlockbenchRendererOptions {
	blockbenchPath: string;
	logger?: Logger;
	/** Milliseconds to wait for Blockbench boot + API readiness. Default 60_000. */
	startTimeoutMs?: number;
	/** Hard per-evaluation timeout. Default 30_000. */
	evalTimeoutMs?: number;
	/** Maximum framing retries. Default 3. */
	maxAttempts?: number;
	/** Required min ink margin in pixels on the final image. Default 16. */
	minMargin?: number;
}

const DEFAULTS: Required<Omit<BlockbenchRendererOptions, 'blockbenchPath' | 'logger'>> = {
	startTimeoutMs: 60_000,
	evalTimeoutMs: 30_000,
	maxAttempts: 3,
	minMargin: 16,
};

interface ProbeResult { ready: boolean; detail: string }
interface LoadResult { ok: boolean; error?: string; elements?: number; textures?: number; format?: string; name?: string }
interface BBoxResult { ok: boolean; error?: string; min?: [number, number, number]; max?: [number, number, number]; keepSize?: number }
interface RenderScriptResult { ok: boolean; error?: string; dataUrl?: string; hiddenCount?: number }

type RenderState = 'idle' | 'starting' | 'ready' | 'disposed';

/**
 * Drives an isolated Blockbench instance (own throwaway profile) over CDP and
 * renders framed PNG previews of .bbmodel files.
 *
 * The instance is reused across renders; loading a new project replaces the previous one.
 */
export class BlockbenchRenderer {
	readonly #options: Required<BlockbenchRendererOptions>;
	#state: RenderState = 'idle';
	#process: ChildProcess | undefined;
	#profile: TempProfile | undefined;
	#cdp: Cdp | undefined;
	#port: number | undefined;
	#bootPromise: Promise<void> | undefined;
	#modelLoaded = false;

	constructor(options: BlockbenchRendererOptions) {
		if (!options.blockbenchPath) throw new Error('blockbenchPath is required');
		this.#options = { ...DEFAULTS, logger: options.logger ?? nullLoggerInstance(), ...options } as Required<BlockbenchRendererOptions>;
	}

	/** Ensure the Blockbench process is up and the page exposes the APIs we need. */
	async ensureReady(): Promise<void> {
		if (this.#state === 'ready') return;
		if (this.#state === 'disposed') throw new Error('Renderer has been disposed');
		if (this.#bootPromise) return this.#bootPromise;

		this.#state = 'starting';
		this.#bootPromise = this.#boot().finally(() => {
			this.#bootPromise = undefined;
		});
		await this.#bootPromise;
		if (this.#state === 'starting') this.#state = 'ready';
	}

	async #boot(): Promise<void> {
		const log = this.#options.logger;
		log.info(`Booting isolated Blockbench from ${this.#options.blockbenchPath}`);

		this.#profile = new TempProfile();
		await this.#profile.create();
		this.#port = await pickFreePort();

		// Note on argv forms:
		//  - `--userData <path>` must be space-separated: Blockbench's own main.js parses it
		//    with argv.findIndex(arg === '--userData') + argv[index + 1].
		//  - `--remote-debugging-port=<port>` must use `=`: Chromium ignores space-separated values.
		const args = [
			'--userData', this.#profile.dir,
			`--remote-debugging-port=${this.#port}`,
			// pass-through of the model path is intentionally omitted; models are piped over CDP
		];
		this.#process = spawn(this.#options.blockbenchPath, args, {
			stdio: ['ignore', 'ignore', 'pipe'],
			detached: false,
			
		});
		this.#process.stderr?.on('data', (data: Buffer) => {
			log.error(`Blockbench stderr: ${data.toString().trim()}`);
		});
		this.#process.on('error', err => log.error(`Blockbench process error: ${err.message}`));

		this.#process.on('exit', () => {
			log.info(`Blockbench process exited (was connected: ${!!this.#cdp})`);
			this.#state = 'idle';
			this.#cdp = undefined;
		});

		log.info(`Waiting for CDP on port ${this.#port}`);
		this.#cdp = await Cdp.connectToPage(this.#port, this.#options.startTimeoutMs);
		const probe = await this.#evaluate<ProbeResult>(
			buildProbeScript({ readyTimeoutMs: this.#options.startTimeoutMs - 5000 }),
			this.#options.startTimeoutMs
		);
		if (!probe.ready) {
			throw new Error(`Blockbench did not expose its APIs in time: ${probe.detail}`);
		}
		log.info('Blockbench ready');
	}

	/**
	 * Render a framed PNG of a .bbmodel file.
	 * Multiple sequential calls reuse the same Blockbench instance.
	 */
	async render(request: RenderRequest): Promise<RenderResult> {
		const warnings: string[] = [];
		await this.ensureReady();

		const width = request.width ?? 512;
		const height = request.height ?? width;
		const transparent = request.transparent ?? true;
		const name = request.name ?? 'model';

		// (Re)load the model content
		const load = await this.#evaluate<LoadResult>(
			buildLoadScript(request.content, `C:/bbmodel-render/${sanitize(name)}.bbmodel`),
			this.#options.evalTimeoutMs
		);
		if (!load.ok) {
			throw new Error(`Failed to load model: ${load.error}`);
		}
		this.#modelLoaded = true;
		this.#options.logger.info(`Loaded ${name}: ${load.elements} elements, ${load.textures} textures (${load.format})`);

		// Measure geometry
		const measure = await this.#evaluate<BBoxResult>(BUILD_BBOX_SCRIPT, this.#options.evalTimeoutMs);
		if (!measure.ok || !measure.min || !measure.max) {
			throw new Error(`Failed to measure model bounds: ${measure.error}`);
		}
		const box: BBox = {
			min: [...measure.min] as [number, number, number],
			max: [...measure.max] as [number, number, number],
		};
		validateBox(box);

		// Fit + render + verify loop
		const verifyOptions: VerifyOptions = {
			minMargin: this.#options.minMargin,
			backgroundColor: transparent ? undefined : [0, 0, 0],
		};

		let padding = request.padding;
		let attempts = 0;
		let margins = { left: 0, right: 0, top: 0, bottom: 0 };
		let png = new Uint8Array(0);
		let outcome: VerifyOutcome = 'empty';

		while (attempts < this.#options.maxAttempts) {
			attempts++;
			const fit = fitBoxToCamera(box, {
				direction: request.direction ?? 'iso',
				padding: padding ?? 1.15,
				aspect: width / height,
			});
			const scriptParams: RenderScriptParams = {
				fit: {
					position: fit.camera.position,
					target: fit.camera.target,
					left: fit.camera.left,
					right: fit.camera.right,
					top: fit.camera.top,
					bottom: fit.camera.bottom,
					near: fit.camera.near,
					far: fit.camera.far,
				},
				width,
				height,
				transparent,
			};

			const renderResult = await this.#evaluate<RenderScriptResult>(
				buildRenderScript(scriptParams),
				this.#options.evalTimeoutMs
			);
			if (!renderResult.ok || !renderResult.dataUrl) {
				throw new Error(`Offscreen render failed: ${renderResult.error}`);
			}

			png = Buffer.from(renderResult.dataUrl.split(',')[1] ?? '', 'base64');
			const decoded = decodePNG(Buffer.from(png));
			const verify = verifyImage(decoded.width, decoded.height, decoded.data, verifyOptions);
			outcome = classify(verify, this.#options.minMargin);
			margins = verify.margins;
			logAttempt(this.#options.logger, name, attempts, outcome, verify.margins, verify.coverage);

			if (outcome === 'ok' || outcome === 'empty') break;

			// Clipped/tight: reframe with more padding for the territory that lacks margin.
			const oriented = pickWorstMarginIncrease(verify, this.#options.minMargin, { width: decoded.width, height: decoded.height });
			padding = (padding ?? 1.15) * oriented;
		}

		if (outcome === 'empty') {
			warnings.push('Render appears empty (no ink detected); check the model for fully hidden geometry.');
		} else if (outcome !== 'ok') {
			warnings.push(`Framing did not converge (outcome: ${outcome}) after ${attempts} attempts.`);
		}

		const finalFit = fitBoxToCamera(box, {
			direction: request.direction ?? 'iso',
			padding: padding ?? 1.15,
			aspect: width / height,
		});

		return {
			png,
			width,
			height,
			box,
			camera: finalFit.camera,
			margins,
			attempts,
			warnings,
		};
	}

	/** Kill the Blockbench instance and clean up the temp profile. */
	async dispose(): Promise<void> {
		this.#state = 'disposed';
		if (this.#modelLoaded) {
			// no-op: the process is being killed anyway
			this.#modelLoaded = false;
		}
		if (this.#cdp) {
			await this.#cdp.dispose();
			this.#cdp = undefined;
		}
		if (this.#process && !this.#process.killed) {
			this.#options.logger.info('Killing isolated Blockbench');
			this.#process.kill();
		}
		this.#process = undefined;
		if (this.#profile) {
			await this.#profile.dispose(this.#options.logger);
			this.#profile = undefined;
		}
		this.#state = 'disposed';
	}

	#requireCdp(): Cdp {
		if (!this.#cdp || this.#cdp.isClosed) throw new Error('CDP connection lost');
		return this.#cdp;
	}

	async #evaluate<T>(expression: string, timeoutMs: number): Promise<T> {
		const cdp = this.#requireCdp();
		try {
			return await cdp.evaluate<T>(expression, { timeoutMs });
		} catch (err) {
			if (err instanceof CdpError && /closed/i.test(err.message)) {
				this.#state = 'idle';
				this.#cdp = undefined;
				throw new Error('Blockbench connection closed unexpectedly');
			}
			throw err;
		}
	}
}

function pickWorstMarginIncrease(
	verify: ReturnType<typeof verifyImage>,
	minMargin: number,
	size: { width: number; height: number }
): number {
	const { margins } = verify;
	// Margins are measured along image axes. Scale the framed half-extents enough
	// for the worst axis: use both width and height remapping via paddingIncreaseForMargins.
	const horizontalScale = Math.max(
		paddingIncreaseForMargins(margins.left, minMargin, size.width),
		paddingIncreaseForMargins(margins.right, minMargin, size.width)
	);
	const verticalScale = Math.max(
		paddingIncreaseForMargins(margins.top, minMargin, size.height),
		paddingIncreaseForMargins(margins.bottom, minMargin, size.height)
	);
	return Math.min(2, Math.max(1.0, Math.sqrt(horizontalScale * verticalScale)));
}

function logAttempt(
	log: Logger,
	name: string,
	attempt: number,
	outcome: VerifyOutcome,
	margins: { left: number; right: number; top: number; bottom: number },
	coverage: number
): void {
	log.info(
		`${name}: attempt ${attempt} => ${outcome} (margins l=${margins.left} r=${margins.right} t=${margins.top} b=${margins.bottom}, coverage ${(coverage * 100).toFixed(1)}%)`
	);
}

async function pickFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address && typeof address === 'object') {
				const port = address.port;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error('no address')));
			}
		});
		server.on('error', reject);
	});
}

function sanitize(name: string): string {
	return name.replace(/[^a-zA-Z0-9 ._-]/g, '_').slice(0, 80) || 'model';
}

function nullLoggerInstance(): Logger {
	return {
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	};
}
