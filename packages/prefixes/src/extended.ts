import { createPrefixCatalog } from './catalog.js';
import { namespaces } from './extended-data.js';

const catalog = createPrefixCatalog(namespaces);
export const prefixes = catalog.prefixes;
export const prefixEntries = catalog.prefixEntries;
export const searchPrefixes = catalog.searchPrefixes;
export type { PrefixEntry } from './catalog.js';
