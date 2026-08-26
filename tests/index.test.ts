import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  AppConfigError,
  getConfig,
  loadConfig,
  type AppConfigErrorCode,
} from '../src/index.js';

function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function setDefaultElement(encoded: string | null): void {
  const element = document.createElement('div');
  element.id = 'app-body';

  if (encoded !== null) {
    element.setAttribute('data-app-config', encoded);
  }

  document.body.replaceChildren(element);
}

async function expectConfigError(
  promise: Promise<unknown>,
  code: AppConfigErrorCode,
): Promise<AppConfigError> {
  try {
    await promise;
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AppConfigError);
    expect(error).toMatchObject({ code, name: 'AppConfigError' });
    return error as AppConfigError;
  }

  throw new Error(`Expected AppConfigError with code ${code}.`);
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadConfig', () => {
  test('loads UTF-8 JSON and deeply freezes it', async () => {
    setDefaultElement(
      encodeJson({
        apiUrl: 'https://example.test/é',
        enabled: true,
        retries: 0,
        empty: '',
        nullable: null,
        nested: { greeting: 'Bonjour 👋', values: [1, 'deux', null] },
      }),
    );

    await loadConfig();

    expect(getConfig<string>('apiUrl')).toBe('https://example.test/é');
    expect(getConfig<boolean>('enabled')).toBe(true);
    expect(getConfig<number>('retries')).toBe(0);
    expect(getConfig<string>('empty')).toBe('');
    expect(getConfig('nullable')).toBeNull();

    const nested = getConfig<{
      greeting: string;
      values: (number | string | null)[];
    }>('nested');

    expect(nested.greeting).toBe('Bonjour 👋');
    expect(Object.isFrozen(nested)).toBe(true);
    expect(Object.isFrozen(nested.values)).toBe(true);
  });

  test('supports custom selectors and a document-like source', async () => {
    const getAttribute = vi.fn<(name: string) => string | null>(() =>
      encodeJson({ mode: 'custom' }),
    );
    const getElementById = vi.fn(() => ({ getAttribute }));

    await loadConfig({
      document: { getElementById },
      elementId: 'root',
      attributeName: 'data-runtime-config',
    });

    expect(getElementById).toHaveBeenCalledWith('root');
    expect(getAttribute).toHaveBeenCalledWith('data-runtime-config');
    expect(getConfig<string>('mode')).toBe('custom');
  });

  test('rejects a missing element', async () => {
    await expectConfigError(loadConfig(), 'ELEMENT_NOT_FOUND');
  });

  test('rejects a missing attribute', async () => {
    setDefaultElement(null);

    await expectConfigError(loadConfig(), 'ATTRIBUTE_MISSING');
  });

  test('rejects an empty attribute', async () => {
    setDefaultElement('');

    await expectConfigError(loadConfig(), 'ATTRIBUTE_MISSING');
  });

  test('rejects malformed standard Base64', async () => {
    setDefaultElement('not base64');

    await expectConfigError(loadConfig(), 'INVALID_BASE64');
  });

  test('wraps a Base64 decoder failure', async () => {
    setDefaultElement(encodeJson({ valid: true }));
    vi.stubGlobal('atob', () => {
      throw new DOMException('Decoder failure');
    });

    const error = await expectConfigError(loadConfig(), 'INVALID_BASE64');

    expect(error.cause).toBeInstanceOf(DOMException);
  });

  test('rejects an environment without a Base64 decoder', async () => {
    setDefaultElement(encodeJson({ valid: true }));
    vi.stubGlobal('atob', undefined);

    await expectConfigError(loadConfig(), 'BASE64_DECODER_UNAVAILABLE');
  });

  test('rejects invalid UTF-8', async () => {
    setDefaultElement('/w==');

    const error = await expectConfigError(loadConfig(), 'INVALID_UTF8');

    expect(error.cause).toBeInstanceOf(TypeError);
  });

  test('rejects an environment without a UTF-8 decoder', async () => {
    setDefaultElement(encodeJson({ valid: true }));
    vi.stubGlobal('TextDecoder', undefined);

    await expectConfigError(loadConfig(), 'UTF8_DECODER_UNAVAILABLE');
  });

  test('rejects malformed JSON', async () => {
    setDefaultElement(btoa('{'));

    const error = await expectConfigError(loadConfig(), 'INVALID_JSON');

    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  test.each([null, [], 'text', 42, true])(
    'rejects a non-object JSON root: %j',
    async (value) => {
      setDefaultElement(encodeJson(value));

      await expectConfigError(loadConfig(), 'INVALID_CONFIG');
    },
  );

  test('clears a previous configuration when reloading fails', async () => {
    setDefaultElement(encodeJson({ apiUrl: 'https://example.test' }));
    await loadConfig();
    expect(getConfig('apiUrl')).toBe('https://example.test');

    setDefaultElement('invalid');
    await expectConfigError(loadConfig(), 'INVALID_BASE64');

    expect(() => getConfig('apiUrl')).toThrow(
      expect.objectContaining({ code: 'NOT_LOADED' }),
    );
  });
});

describe('getConfig', () => {
  test('rejects missing and inherited property names', async () => {
    setDefaultElement(encodeJson({ present: false }));
    await loadConfig();

    expect(getConfig<boolean>('present')).toBe(false);
    expect(() => getConfig('missing')).toThrow(
      expect.objectContaining({ code: 'KEY_NOT_FOUND' }),
    );
    expect(() => getConfig('toString')).toThrow(
      expect.objectContaining({ code: 'KEY_NOT_FOUND' }),
    );
  });
});
