import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const backend = resolve(import.meta.dirname, '../../sica-qr-backend');
const frontend = resolve(import.meta.dirname, '..');
const children = [
  spawn('npm', ['run', 'dev'], { cwd: backend, stdio: 'inherit' }),
  spawn('npm', ['run', 'worker:dev'], { cwd: backend, stdio: 'inherit' }),
  spawn('npm', ['run', 'dev'], { cwd: frontend, stdio: 'inherit' }),
];
let closing = false;
function shutdown(code = 0) { if (closing) return; closing = true; process.exitCode = code; for (const child of children) child.kill('SIGTERM'); }
for (const child of children) { child.on('error', () => shutdown(1)); child.on('exit', code => shutdown(code ?? 0)); }
process.once('SIGINT', () => shutdown()); process.once('SIGTERM', () => shutdown());
