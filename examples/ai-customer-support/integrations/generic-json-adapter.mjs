// Default offline adapter. Reads one bundled, fictional page; no env or network.
import { createReadStream } from 'node:fs';
import { normalizePage, readBounded } from './generic-page.mjs';
const pages = new Map([[null, '1'], ['generic-page-1', '2'], ['generic-page-2', 'done']]);
export default {
  id: 'generic-json',
  async pull(context) {
    try {
      if (!pages.has(context.cursor)) throw new Error();
      const stream = createReadStream(new URL(`./fixtures/generic-page-${pages.get(context.cursor)}.json`, import.meta.url));
      return normalizePage(await readBounded(stream), context);
    } catch { throw new Error('BUSINESS_ADAPTER_FAILED'); }
  },
};
