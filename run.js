import { spawn } from 'child_process';
import electronPath from 'electron';

const env = { ...process.env };
// Ensure Electron runs in full GUI app mode rather than plain Node mode
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.', ...process.argv.slice(2)];
const child = spawn(electronPath, args, {
  env,
  stdio: 'inherit',
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

