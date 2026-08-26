/** A primitive value accepted by JSON. */
export type JsonPrimitive = string | number | boolean | null;

/** An immutable JSON array. */
export type JsonArray = readonly JsonValue[];

/** An immutable JSON object. */
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;

/** Any value that can be represented in JSON. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Recursively marks every property and array item in a type as immutable. */
export type DeepReadonly<T> = T extends JsonPrimitive
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** The root object stored as the application configuration. */
export type AppConfig = JsonObject;

/** The minimum DOM element contract required by {@link loadConfig}. */
export interface ConfigElement {
  getAttribute(name: string): string | null;
}

/** The minimum document contract required by {@link loadConfig}. */
export interface ConfigDocument {
  getElementById(elementId: string): ConfigElement | null;
}

/** Options accepted by {@link loadConfig}. */
export interface LoadConfigOptions {
  /** Document-like source. Defaults to the browser's global document. */
  readonly document?: ConfigDocument;

  /** ID of the element containing the configuration. Defaults to `app-body`. */
  readonly elementId?: string;

  /** Attribute containing the Base64 value. Defaults to `data-app-config`. */
  readonly attributeName?: string;
}

/** Stable error codes exposed by {@link AppConfigError}. */
export type AppConfigErrorCode =
  | 'DOM_UNAVAILABLE'
  | 'ELEMENT_NOT_FOUND'
  | 'ATTRIBUTE_MISSING'
  | 'BASE64_DECODER_UNAVAILABLE'
  | 'INVALID_BASE64'
  | 'UTF8_DECODER_UNAVAILABLE'
  | 'INVALID_UTF8'
  | 'INVALID_JSON'
  | 'INVALID_CONFIG'
  | 'NOT_LOADED'
  | 'KEY_NOT_FOUND';

/** Error raised when the application configuration cannot be loaded or read. */
export class AppConfigError extends Error {
  override readonly name = 'AppConfigError';
  readonly code: AppConfigErrorCode;
  readonly cause: unknown;

  constructor(code: AppConfigErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

const DEFAULT_ELEMENT_ID = 'app-body';
const DEFAULT_ATTRIBUTE_NAME = 'data-app-config';
const STANDARD_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

let config: AppConfig | null = null;

function decodeBase64(encoded: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new AppConfigError(
      'BASE64_DECODER_UNAVAILABLE',
      'The current environment does not provide a Base64 decoder.',
    );
  }

  let binary: string;

  try {
    binary = globalThis.atob(encoded);
  } catch (error: unknown) {
    throw new AppConfigError(
      'INVALID_BASE64',
      'The application configuration is not valid Base64.',
      error,
    );
  }

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof globalThis.TextDecoder !== 'function') {
    throw new AppConfigError(
      'UTF8_DECODER_UNAVAILABLE',
      'The current environment does not provide a UTF-8 decoder.',
    );
  }

  try {
    return new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error: unknown) {
    throw new AppConfigError(
      'INVALID_UTF8',
      'The decoded application configuration is not valid UTF-8.',
      error,
    );
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepFreeze(root: JsonObject): void {
  const pending: (JsonArray | JsonObject)[] = [root];

  for (const value of pending) {
    const nestedValues: readonly JsonValue[] = Array.isArray(value)
      ? value
      : Object.values(value);

    for (const nestedValue of nestedValues) {
      if (nestedValue !== null && typeof nestedValue === 'object') {
        pending.push(nestedValue);
      }
    }

    Object.freeze(value);
  }
}

function parseConfig(encoded: string): AppConfig {
  if (encoded.length === 0) {
    throw new AppConfigError(
      'ATTRIBUTE_MISSING',
      'The application configuration attribute is empty.',
    );
  }

  if (!STANDARD_BASE64_PATTERN.test(encoded)) {
    throw new AppConfigError(
      'INVALID_BASE64',
      'The application configuration is not valid standard Base64.',
    );
  }

  const decoded = decodeUtf8(decodeBase64(encoded));
  let parsed: unknown;

  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch (error: unknown) {
    throw new AppConfigError(
      'INVALID_JSON',
      'The decoded application configuration is not valid JSON.',
      error,
    );
  }

  if (!isJsonObject(parsed)) {
    throw new AppConfigError(
      'INVALID_CONFIG',
      'The application configuration must be a JSON object.',
    );
  }

  deepFreeze(parsed);
  return parsed;
}

/**
 * Loads application configuration from a Base64-encoded DOM attribute.
 *
 * Errors are intentionally propagated so the application can decide how to
 * report or recover from an invalid runtime configuration. A failed reload
 * clears any configuration that had previously been loaded.
 *
 * @param options DOM source and attribute overrides.
 * @throws {AppConfigError} If the DOM source or encoded configuration is invalid.
 */
// Promise<void> is retained as part of the requested public API.
// eslint-disable-next-line @typescript-eslint/require-await
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<void> {
  config = null;

  const documentSource =
    options.document ??
    (typeof globalThis.document === 'undefined'
      ? undefined
      : globalThis.document);

  if (documentSource === undefined) {
    throw new AppConfigError(
      'DOM_UNAVAILABLE',
      'The DOM is unavailable. Call loadConfig() in a browser after the document has been created.',
    );
  }

  const elementId = options.elementId ?? DEFAULT_ELEMENT_ID;
  const attributeName = options.attributeName ?? DEFAULT_ATTRIBUTE_NAME;
  const element = documentSource.getElementById(elementId);

  if (element === null) {
    throw new AppConfigError(
      'ELEMENT_NOT_FOUND',
      `Element #${elementId} was not found in the DOM.`,
    );
  }

  const encoded = element.getAttribute(attributeName);

  if (encoded === null) {
    throw new AppConfigError(
      'ATTRIBUTE_MISSING',
      `Attribute ${attributeName} is missing from #${elementId}.`,
    );
  }

  config = parseConfig(encoded);
}

/**
 * Retrieves a loaded configuration value by key.
 *
 * The generic type is a caller-provided assertion; use runtime validation in
 * the application when configuration values cross a trust boundary.
 *
 * @param key Configuration property name.
 * @returns The corresponding configuration value.
 * @throws {AppConfigError} If no configuration is loaded or the key is absent.
 */
// T intentionally lets callers assert the expected type of a runtime value.
export function getConfig<T = unknown>(key: string): DeepReadonly<T> {
  if (config === null) {
    throw new AppConfigError(
      'NOT_LOADED',
      'App config is not loaded. You must call and await loadConfig() first.',
    );
  }

  if (!Object.prototype.hasOwnProperty.call(config, key)) {
    throw new AppConfigError(
      'KEY_NOT_FOUND',
      `Configuration key "${key}" was not found.`,
    );
  }

  return config[key] as DeepReadonly<T>;
}
