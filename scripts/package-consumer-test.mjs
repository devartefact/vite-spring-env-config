import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'vite-spring-env-config-'),
);
const npmCli = process.env.npm_execpath;

if (npmCli === undefined) {
  throw new Error('npm_execpath is unavailable. Run this test through npm.');
}

function runNode(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${process.execPath} ${args.join(' ')}`,
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return result.stdout;
}

try {
  const packOutput = runNode(
    [
      npmCli,
      'pack',
      '--dry-run=false',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporaryDirectory,
    ],
    projectRoot,
  );
  const packResult = JSON.parse(packOutput);

  if (
    !Array.isArray(packResult) ||
    typeof packResult[0]?.filename !== 'string'
  ) {
    throw new Error('npm pack returned an unexpected result.');
  }

  const archivePath = join(temporaryDirectory, packResult[0].filename);
  const consumerSource = `
import {
  getConfig,
  loadConfig,
  type DeepReadonly,
} from 'vite-spring-env-config';

function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

const encoded = encodeJson({
  greeting: 'Bonjour 👋',
  settings: { enabled: true },
});

await loadConfig({
  document: {
    getElementById: () => ({ getAttribute: () => encoded }),
  },
});

const greeting = getConfig<string>('greeting');
const settings = getConfig<{ enabled: boolean }>('settings');
const typeCheck: DeepReadonly<{ enabled: boolean }> = settings;

if (greeting !== 'Bonjour 👋' || typeCheck.enabled !== true) {
  throw new Error('The installed package returned an unexpected value.');
}
`;
  const nodeNextConfig = {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      strict: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  };
  const bundlerConfig = {
    compilerOptions: {
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      noEmit: true,
      strict: true,
      skipLibCheck: false,
    },
    include: ['consumer.ts'],
  };

  await Promise.all([
    writeFile(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    ),
    writeFile(join(temporaryDirectory, 'consumer.ts'), consumerSource),
    writeFile(
      join(temporaryDirectory, 'tsconfig.nodenext.json'),
      JSON.stringify(nodeNextConfig),
    ),
    writeFile(
      join(temporaryDirectory, 'tsconfig.bundler.json'),
      JSON.stringify(bundlerConfig),
    ),
  ]);

  runNode(
    [
      npmCli,
      'install',
      '--dry-run=false',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      archivePath,
    ],
    temporaryDirectory,
  );

  const typescriptCli = join(
    projectRoot,
    'node_modules',
    'typescript',
    'bin',
    'tsc',
  );

  runNode([typescriptCli, '-p', 'tsconfig.nodenext.json'], temporaryDirectory);
  runNode([typescriptCli, '-p', 'tsconfig.bundler.json'], temporaryDirectory);
  runNode(
    [join(temporaryDirectory, 'dist', 'consumer.js')],
    temporaryDirectory,
  );
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
