import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { getConfig, loadConfig } from '../dist/index.js';

const encoded = Buffer.from(
  JSON.stringify({ greeting: 'Bonjour 👋', enabled: true }),
  'utf8',
).toString('base64');

await loadConfig({
  document: {
    getElementById(elementId) {
      assert.equal(elementId, 'app-body');

      return {
        getAttribute(attributeName) {
          assert.equal(attributeName, 'data-app-config');
          return encoded;
        },
      };
    },
  },
});

assert.equal(getConfig('greeting'), 'Bonjour 👋');
assert.equal(getConfig('enabled'), true);
