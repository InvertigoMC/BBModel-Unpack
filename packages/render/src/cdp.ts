/**
 * Minimal Chrome DevTools Protocol client over WebSocket.
 * Uses the WebSocket client built into Node >= 22; no external dependencies.
 */

interface CdpResponse {
	id: number;
	result?: unknown;
	error?: { message: string; data?: string };
}

interface TargetInfo {
	id: string;
	type: string;
	webSocketDebuggerUrl: string;
	title?: string;
}

export interface CdpEvaluateOptions {
	awaitPromise?: boolean;
	/** Hard limit in milliseconds; 0 disables the timeout. */
	timeoutMs?: number;
}

export class CdpError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CdpError';
	}
}

interface WsMessageEvent { data: unknown }
interface WsOpenEvent extends Event { type: string }
type Listener = (event: WsMessageEvent | WsOpenEvent) => void;
type WebSocketLike = { new (url: string): { send(data: string): void; close(): void; addEventListener(type: string, listener: Listener): void } };

/** List CDP targets (pages) for a debugging port. */
export async function listTargets(port: number): Promise<TargetInfo[]> {
	const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5_000) });
	if (!response.ok) throw new CdpError(`/json/list returned ${response.status}`);
	return (await response.json()) as TargetInfo[];
}

export function getWebSocketCtor(): WebSocketLike {
	const WS = (globalThis as { WebSocket?: WebSocketLike }).WebSocket;
	if (!WS) throw new CdpError('Node >= 22 is required (global WebSocket client)');
	return WS;
}

export class Cdp {
	#ws: InstanceType<WebSocketLike> | undefined;
	#nextId = 0;
	#pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
	#closed = false;

	/** Connect to a debuggable page target. */
	static async connectToPage(port: number, timeoutMs = 20_000): Promise<Cdp> {
		const deadline = Date.now() + timeoutMs;
		let lastError: Error | undefined;
		while (Date.now() < deadline) {
			try {
				const targets = await listTargets(port);
				const page = targets.find(t => t.type === 'page');
				if (page) {
					return await Cdp.#connectWebSocket(page.webSocketDebuggerUrl);
				}
				lastError = new CdpError('No page target found yet');
			} catch (err) {
				lastError = err instanceof Error ? err : new CdpError(String(err));
			}
			await sleep(500);
		}
		throw new CdpError(`Could not reach CDP page target on port ${port}: ${lastError?.message}`);
	}

	static async #connectWebSocket(url: string): Promise<Cdp> {
		const WS = getWebSocketCtor();
		const ws = new WS(url);
		const client = new Cdp();
		const opened = new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new CdpError('WebSocket connect timeout')), 15_000);
			ws.addEventListener('open', (() => {
				clearTimeout(timer);
				resolve();
			}) as unknown as never);
			ws.addEventListener('error', (() => {
				clearTimeout(timer);
				reject(new CdpError('WebSocket connect failed'));
			}) as unknown as never);
		});
		ws.addEventListener('message', ((event: WsMessageEvent) => {
			const data = typeof event.data === 'string' ? event.data : String(event.data);
			client.#onMessage(data);
		}) as unknown as never);
		ws.addEventListener('close', () => client.#onClose());
		client.#ws = ws;
		await opened;
		return client;
	}

	#onMessage(raw: string): void {
		let msg: CdpResponse;
		try {
			msg = JSON.parse(raw) as CdpResponse;
		} catch {
			return; // not a valid CDP message; ignore
		}
		const entry = this.#pending.get(msg.id);
		if (!entry) return;
		this.#pending.delete(msg.id);
		if (msg.error) {
			entry.reject(new CdpError(`${msg.error.message}${msg.error.data ? ': ' + msg.error.data : ''}`));
		} else {
			entry.resolve(msg.result);
		}
	}

	#onClose(): void {
		if (this.#closed) return;
		this.#closed = true;
		for (const entry of this.#pending.values()) entry.reject(new CdpError('WebSocket closed'));
		this.#pending.clear();
	}

	send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
		if (this.#closed || !this.#ws) return Promise.reject(new CdpError('WebSocket closed'));
		const id = ++this.#nextId;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#ws?.send(JSON.stringify({ id, method, params }));
		});
	}

	/**
	 * Evaluate an expression in the page context.
	 * Resolves with the JSON-serializable result value (returnByValue), rejects on page exceptions.
	 */
	async evaluate<T>(expression: string, options: CdpEvaluateOptions = {}): Promise<T> {
		const { awaitPromise = true, timeoutMs = 30_000 } = options;
		let result: unknown;
		if (timeoutMs > 0) {
			result = await Promise.race([
				this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }),
				sleep(timeoutMs).then(() => { throw new CdpError(`Runtime.evaluate timed out after ${timeoutMs}ms`); }),
			]);
		} else {
			result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
		}
		const response = result as {
			result?: { value?: unknown };
			exceptionDetails?: { text: string; exception?: { description?: string; value?: unknown } };
		};
		if (response.exceptionDetails) {
			const detail =
				response.exceptionDetails.exception?.description ??
				response.exceptionDetails.text ??
				JSON.stringify(response.exceptionDetails);
			throw new CdpError(`Page exception: ${detail}`);
		}
		return (response.result?.value ?? undefined) as T;
	}

	async dispose(): Promise<void> {
		try {
			this.#pending.clear();
			this.#ws?.close();
		} catch {
			// best effort
		}
		this.#ws = undefined;
		this.#closed = true;
	}

	get isClosed(): boolean {
		return this.#closed;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
