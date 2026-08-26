// @vitest-environment node

import { describe, expect, test } from 'vitest';

import { AppConfigError, getConfig, loadConfig } from '../src/index.js';

describe('server-side rendering safety', () => {
  test('imports without accessing the DOM', () => {
    expect(typeof loadConfig).toBe('function');
    expect(typeof getConfig).toBe('function');
  });

  test('rejects loadConfig when the DOM is unavailable', async () => {
    await expect(loadConfig()).rejects.toMatchObject({
      code: 'DOM_UNAVAILABLE',
      name: 'AppConfigError',
    });
  });

  test('rejects getConfig before a successful load', () => {
    expect(() => getConfig('apiUrl')).toThrow(AppConfigError);
    expect(() => getConfig('apiUrl')).toThrow(
      expect.objectContaining({ code: 'NOT_LOADED' }),
    );
  });
});
