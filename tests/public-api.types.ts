import { getConfig } from '../src/index.js';

export function verifyPublicTypes(): void {
  const settings = getConfig<{
    enabled: boolean;
    nested: { values: string[] };
  }>('settings');

  // @ts-expect-error Loaded configuration properties are deeply immutable.
  settings.enabled = false;

  // @ts-expect-error Loaded configuration arrays are deeply immutable.
  settings.nested.values[0] = 'new value';
}
