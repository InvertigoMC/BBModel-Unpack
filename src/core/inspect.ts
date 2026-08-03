/**
 * Non-destructive inspection of a normalized model: counts what is present,
 * which is used for the "Preview BBModel Contents" command and for progress
 * and report output.
 */

import { NormalizedModel, NormalizedNode } from './types';
import { elementType } from './parse';
import { animationSpan } from './animations';

export interface ModelInventory {
  name: string;
  formatVersion: string;
  modelFormat: string;
  boxUv: boolean;
  resolution: { width: number; height: number };
  elementCounts: Record<string, number>;
  groupCount: number;
  textureCount: number;
  embeddedTextureCount: number;
  animationCount: number;
  animationNames: string[];
  controllerCount: number;
  controllerNames: string[];
  hasDisplaySettings: boolean;
  warnings: string[];
}

export function buildInventory(model: NormalizedModel): ModelInventory {
  const elementCounts: Record<string, number> = {};
  for (const element of model.elements) {
    const type = elementType(element);
    elementCounts[type] = (elementCounts[type] ?? 0) + 1;
  }

  let groupCount = 0;
  const countGroups = (nodes: NormalizedNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'group') {
        groupCount++;
        countGroups(node.group.children);
      }
    }
  };
  countGroups(model.rootNodes);

  const embeddedTextureCount = model.textures.filter(
    (t) => typeof t.source === 'string' && t.source.startsWith('data:')
  ).length;

  return {
    name: model.name,
    formatVersion: model.formatVersion,
    modelFormat: model.modelFormat,
    boxUv: model.boxUv,
    resolution: model.resolution,
    elementCounts,
    groupCount,
    textureCount: model.textures.length,
    embeddedTextureCount,
    animationCount: model.animations.length,
    animationNames: model.animations.map((a) => a.name ?? 'animation'),
    controllerCount: model.controllers.length,
    controllerNames: model.controllers.map((c) => c.name ?? 'controller'),
    hasDisplaySettings: !!model.display && Object.keys(model.display).length > 0,
    warnings: model.warnings,
  };
}

/** Render the inventory as Markdown for the preview document. */
export function renderInventoryMarkdown(
  inventory: ModelInventory,
  model: NormalizedModel,
  sourceLabel: string
): string {
  const lines: string[] = [];
  lines.push(`# BBModel contents: ${inventory.name}`);
  lines.push('');
  lines.push(`Source: \`${sourceLabel}\``);
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Blockbench container version | ${inventory.formatVersion} |`);
  lines.push(`| Model format | ${inventory.modelFormat} |`);
  lines.push(`| UV mode | ${inventory.boxUv ? 'box UV' : 'per-face UV'} |`);
  lines.push(`| Texture resolution | ${inventory.resolution.width} x ${inventory.resolution.height} |`);
  lines.push(`| Groups (bones) | ${inventory.groupCount} |`);
  const elementSummary = Object.entries(inventory.elementCounts)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  lines.push(`| Elements | ${elementSummary || 'none'} |`);
  lines.push(
    `| Textures | ${inventory.textureCount} (${inventory.embeddedTextureCount} embedded) |`
  );
  lines.push(`| Animations | ${inventory.animationCount} |`);
  lines.push(`| Animation controllers | ${inventory.controllerCount} |`);
  lines.push(`| Display settings | ${inventory.hasDisplaySettings ? 'yes' : 'no'} |`);
  lines.push('');

  if (inventory.animationCount) {
    lines.push('## Animations');
    lines.push('');
    for (const animation of model.animations) {
      const loop = animation.loop === 'loop' ? 'looping' : animation.loop === 'hold' ? 'hold last frame' : 'play once';
      lines.push(`- \`${animation.name ?? 'animation'}\` — ${animationSpan(animation)}, ${loop}`);
    }
    lines.push('');
  }
  if (inventory.controllerCount) {
    lines.push('## Animation controllers');
    lines.push('');
    for (const name of inventory.controllerNames) lines.push(`- \`${name}\``);
    lines.push('');
  }
  if (inventory.textureCount) {
    lines.push('## Textures');
    lines.push('');
    model.textures.forEach((texture, i) => {
      const embedded = typeof texture.source === 'string' && texture.source.startsWith('data:');
      lines.push(
        `- \`${texture.name ?? `texture_${i}`}\` — ${embedded ? 'embedded' : 'external reference only'}`
      );
    });
    lines.push('');
  }
  if (inventory.warnings.length) {
    lines.push('## Notes');
    lines.push('');
    for (const warning of inventory.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(
    'Run **Extract BBModel Contents** on this file to write these sections to disk as ' +
      'Bedrock geometry/animation JSON, PNG textures and display settings.'
  );
  lines.push('');
  return lines.join('\n');
}
