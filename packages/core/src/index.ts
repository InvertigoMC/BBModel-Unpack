export * from './animations';
export * from './controllers';
export * from './extractor';
export * from './fileio';
export * from './geometry';
export * from './inspect';
export * from './mathUtil';
export * from './names';
export * from './parse';
export * from './textures';
export * from './types';

/**
 * Public API of @bbmodels-tools/core.
 *
 * - `loadBBModel` / `parseBBModelText` — read .bbmodel files.
 * - `buildInventory` / `renderInventoryMarkdown` — summarize a model.
 * - `convertToBedrockGeometry`, `convertAnimationsToBedrock`,
 *   `convertControllersToBedrock`, `decodeTextures` — individual converters.
 * - `extractBBModel` + `FileIO`/`NodeFileIO` — write a full extraction to disk.
 */
