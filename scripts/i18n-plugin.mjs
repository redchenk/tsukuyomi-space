import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import interfaceCompiler from './i18n-transform.cjs';

const frontendRoot = fileURLToPath(new URL('../src/frontend', import.meta.url));
const catalogUrl = new URL('../src/frontend/i18n/interface-catalog.json', import.meta.url);

// Other entry points import shared frontend modules too. Resolve their local
// language chunks without rewriting an unrelated application's templates.
export function interfaceLocalization({ transformSource = true } = {}) {
  return {
    name: 'tsukuyomi-interface-i18n',
    enforce: 'pre',
    resolveId(id) {
      if (/^virtual:tsukuyomi-interface-(en|ja)$/.test(id)) return '\0' + id;
    },
    load(id) {
      const match = /^\0virtual:tsukuyomi-interface-(en|ja)$/.exec(id);
      if (!match) return;
      const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
      return 'export default ' + JSON.stringify(Object.fromEntries(
        Object.entries(catalog).map(([source, values]) => [source, values[match[1]]])
      ));
    },
    transform(source, id) {
      if (!transformSource || !id.startsWith(frontendRoot) || !/\.(?:vue|js|mjs)$/.test(id)
        || /\/(?:i18n|runtime|constants|data)\//.test(id)) return null;
      const result = interfaceCompiler.transformInterface(source, id);
      return result.changed ? { code: result.code, map: null } : null;
    }
  };
}
