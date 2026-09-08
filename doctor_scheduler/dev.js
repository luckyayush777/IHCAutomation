import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const python = fileURLToPath(
  new URL(
    process.platform === 'win32' ? './.venv/Scripts/python.exe' : './.venv/bin/python',
    import.meta.url,
  ),
);

if (!existsSync(python)) {
  console.error('Create the local Python environment first; see doctor_scheduler/README.md.');
  process.exit(1);
}

const result = spawnSync(
  python,
  [fileURLToPath(new URL('./dev.py', import.meta.url)), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

if (result.error) console.error(`Unable to start the scheduler: ${result.error.message}`);
process.exit(result.status ?? (result.signal === 'SIGINT' ? 130 : 1));
