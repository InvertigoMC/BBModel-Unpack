#!/usr/bin/env node
/**
 * Manual CLI for automated Blockbench rendering (used for e2e validation;
 * VS Code and MCP consumers call BlockbenchRenderer directly).
 *
 * Usage:
 *   node dist/cli.js <file.bbmodel> [--out out.png] [--width 512] [--height 512]
 *        [--direction iso|front|back|left|right|top|bottom] [--padding 1.15]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BlockbenchRenderer } from './renderModel';
import { locateBlockbench } from './locate';
import { CameraDirection } from './types';

function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			args[argv[i].slice(2)] = argv[i + 1] ?? '';
			i++;
		} else {
			args.file = argv[i];
		}
	}
	return args;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (!args.file) {
		console.error('usage: node dist/cli.js <file.bbmodel> [--out out.png] [--width N] [--direction iso] [--padding F]');
		process.exitCode = 2;
		return;
	}

	const located = locateBlockbench();
	if (!located) {
		console.error('Blockbench executable not found. Set BBMODEL_BLOCKBENCH_PATH or install Blockbench.');
		process.exitCode = 1;
		return;
	}
	const content = fs.readFileSync(args.file, 'utf8');
	const out = args.out ?? path.join('scratch', `${path.basename(args.file, '.bbmodel')}.png`);
	fs.mkdirSync(path.dirname(out), { recursive: true });

	const logger = {
		info: (msg: string) => console.log(`[info] ${msg}`),
		warn: (msg: string) => console.warn(`[warn] ${msg}`),
		error: (msg: string) => console.error(`[error] ${msg}`),
	};

	const renderer = new BlockbenchRenderer({ blockbenchPath: located.path, logger });
	try {
		const result = await renderer.render({
			content,
			name: path.basename(args.file, '.bbmodel'),
			width: args.width ? parseInt(args.width, 10) : 512,
			direction: (args.direction as CameraDirection | undefined) ?? 'iso',
			padding: args.padding ? parseFloat(args.padding) : undefined,
		});
		fs.writeFileSync(out, result.png);
		logger.info(
			`Saved ${out} (${result.width}x${result.height}, attempts=${result.attempts}, ` +
				`margins l=${result.margins.left} r=${result.margins.right} t=${result.margins.top} b=${result.margins.bottom})`
		);
		for (const warning of result.warnings) logger.warn(warning);
	} finally {
		await renderer.dispose();
	}
}

void main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
