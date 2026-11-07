import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LocateOptions {
	/** Explicit override, takes precedence. */
	override?: string;
}

export interface LocateResult {
	path: string;
	source: 'override' | 'default';
}

function candidates(): string[] {
	const list: string[] = [];
	switch (process.platform) {
		case 'win32': {
			const localAppData = process.env.LOCALAPPDATA;
			const programFiles = process.env['ProgramFiles'];
			const programFilesX86 = process.env['ProgramFiles(x86)'];
			if (localAppData) list.push(path.join(localAppData, 'Programs', 'Blockbench', 'Blockbench.exe'));
			if (programFiles) list.push(path.join(programFiles, 'Blockbench', 'Blockbench.exe'));
			if (programFilesX86) list.push(path.join(programFilesX86, 'Blockbench', 'Blockbench.exe'));
			break;
		}
		case 'darwin':
			list.push('/Applications/Blockbench.app/Contents/MacOS/Blockbench');
			break;
		default:
			list.push('/usr/bin/blockbench', '/opt/Blockbench/blockbench', '/snap/bin/blockbench');
			break;
	}
	return list;
}

/**
 * Find the Blockbench executable.
 * Order: explicit override -> BBMODEL_BLOCKBENCH_PATH environment variable -> platform default locations.
 */
export function locateBlockbench(options: LocateOptions = {}): LocateResult | undefined {
	const override = options.override ?? process.env.BBMODEL_BLOCKBENCH_PATH;
	if (override && fs.existsSync(override)) {
		return { path: override, source: 'override' };
	}
	for (const candidate of candidates()) {
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return { path: candidate, source: 'default' };
		} catch {
			// keep looking
		}
	}
	return undefined;
}
