import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const childEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => name.toLowerCase() !== 'npm_config_dry_run',
  ),
);

childEnvironment.npm_config_dry_run = 'false';

const cliPath = join(
  projectRoot,
  'node_modules',
  '@arethetypeswrong',
  'cli',
  'dist',
  'index.js',
);
const result = spawnSync(
  process.execPath,
  [cliPath, '--pack', '.', '--ignore-rules=cjs-resolves-to-esm'],
  {
    cwd: projectRoot,
    env: childEnvironment,
    stdio: 'inherit',
  },
);

if (result.error !== undefined) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
