const WebSocket = require('ws');
const readline = require('node:readline');
const os = require('node:os');
const path = require('node:path');

const socket = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
  'app-server-control', 'app-server-control.sock');
const ws = new WebSocket(`ws+unix://${socket}:/rpc`, { perMessageDeflate: false });
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = [];
let closed = false;
let timer = setTimeout(() => {
  console.error('[desktop-daemon-bridge] Daemon connection timed out');
  ws.terminate();
  process.exitCode = 1;
}, 10000);

input.on('line', line => {
  if (!line.trim()) return;
  if (ws.readyState === WebSocket.OPEN) ws.send(line);
  else if (ws.readyState === WebSocket.CONNECTING) pending.push(line);
});
input.on('close', () => {
  closed = true;
  if (ws.readyState === WebSocket.OPEN) ws.close();
});
ws.on('open', () => {
  clearTimeout(timer);
  console.error('[desktop-daemon-bridge] Connected to existing Managed Daemon');
  for (const line of pending.splice(0)) ws.send(line);
  if (closed) ws.close();
});
ws.on('message', data => {
  // Each WebSocket message contains one app-server JSON-RPC message.
  if (!process.stdout.write(data.toString() + '\n')) ws.pause();
});
process.stdout.on('drain', () => ws.resume());
ws.on('error', error => {
  console.error('[desktop-daemon-bridge]', error.message);
  process.exitCode = 1;
});
ws.on('close', () => {
  clearTimeout(timer);
  input.close();
  process.stdin.destroy();
});
process.on('SIGTERM', () => { ws.terminate(); process.exit(0); });
process.on('SIGINT', () => { ws.terminate(); process.exit(0); });
