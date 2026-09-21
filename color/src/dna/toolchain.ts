/**
 * The toolchain stamp recorded in an extracted DNA: which colour libraries
 * produced these numbers.
 *
 * This lives apart from `system.ts` because it is the only part of extraction
 * that touches the filesystem, and `system.ts` is on the solve path — a module
 * that reads `package.json` at import time cannot be bundled for a browser, and
 * the solver has no business needing one. `extractSystemDNA` takes the stamp as
 * an option; only the build script calls this.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { APCA_VERSION } from '../contrast/index.ts';
import type { Toolchain } from './schema.ts';

const require = createRequire(import.meta.url);

export function defaultToolchain(): Toolchain {
  // colorjs.io does not export its package.json; read it from the resolved entry's directory.
  const v = (p: string, entry?: string) => {
    try { return (require(`${p}/package.json`) as { version: string }).version; } catch {
      const dir = require.resolve(entry ?? p).split('/node_modules/')[0] + '/node_modules/' + p;
      return (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { version: string }).version;
    }
  };
  return { culori: v('culori'), colorjs: v('colorjs.io'), nutelch: '0.2.0@915b785', apca: APCA_VERSION };
}
