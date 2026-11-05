const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const readline = require('node:readline');
const { WebSocketServer } = require('ws');

async function fixture(t) {
  // Keep the Unix socket path below macOS's length limit.
  const home = await mkdtemp('/tmp/cdb-');
  await mkdir(path.join(home, 'app-server-control'));
  const socket = path.join(home, 'app-server-control/app-server-control.sock');
  const server = http.createServer();
  const wss = new WebSocketServer({ server });
  server.listen(socket);
  await once(server, 'listening');
  t.after(async () => {
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await rm(home, { recursive: true, force: true });
  });
  return { home, wss };
}

function startBridge(t, home) {
  const child = spawn(process.execPath, [path.join(__dirname, '../bridge.cjs')], {
    env: { ...process.env, CODEX_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  t.after(() => child.kill());
  return { child, stderr: () => stderr };
}

test('preserves JSON-RPC requests, responses, notifications and ping/pong', { timeout: 8000 }, async t => {
  const { home, wss } = await fixture(t);
  const connected = once(wss, 'connection');
  const { child } = startBridge(t, home);
  const output = readline.createInterface({ input: child.stdout });
  const lines = [];
  output.on('line', line => lines.push(JSON.parse(line)));
  // A split line and CRLF exercise framing before the socket is ready.
  child.stdin.write('{"id":1,"method":"ini');
  child.stdin.write('tialize"}\r\n\n{"id":2,"method":"thread/list"}\n');
  const [ws] = await connected;
  const received = [];
  ws.on('message', bytes => {
    const message = JSON.parse(bytes.toString());
    received.push(message);
    ws.send(JSON.stringify({ id: message.id, result: { ok: true } }));
    if (received.length === 2) ws.send('{"method":"thread/updated","params":{}}');
  });
  const pong = once(ws, 'pong');
  ws.ping('probe');
  assert.equal((await pong)[0].toString(), 'probe');
  while (lines.length < 3) await once(output, 'line');
  assert.deepEqual(received.map(x => x.method), ['initialize', 'thread/list']);
  assert.deepEqual(lines, [
    { id: 1, result: { ok: true } },
    { id: 2, result: { ok: true } },
    { method: 'thread/updated', params: {} },
  ]);
  const exited = once(child, 'exit');
  child.stdin.end();
  assert.equal((await exited)[0], 0);
});

test('exits when the daemon closes the connection', { timeout: 8000 }, async t => {
  const { home, wss } = await fixture(t);
  const connected = once(wss, 'connection');
  const { child } = startBridge(t, home);
  const [ws] = await connected;
  const exited = once(child, 'exit');
  ws.close();
  assert.equal((await exited)[0], 0);
});

test('reports an unavailable socket on stderr and exits nonzero', { timeout: 8000 }, async t => {
  const home = await mkdtemp(path.join(tmpdir(), 'cdb-missing-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const { child, stderr } = startBridge(t, home);
  let stdout = '';
  child.stdout.on('data', data => { stdout += data; });
  const [code] = await once(child, 'close');
  assert.equal(code, 1);
  assert.match(stderr(), /ENOENT/);
  assert.equal(stdout, '');
});
