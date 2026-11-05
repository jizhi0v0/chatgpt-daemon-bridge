const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
const wrapper = path.join(__dirname, '../codex-desktop');

async function home(t) {
  const root = await mkdtemp('/tmp/cdb-wrapper-');
  const dir = path.join(root, 'home with spaces/packages/standalone/current/bin');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'codex'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { ...process.env, CODEX_HOME: path.join(root, 'home with spaces') };
}

test('passes through version, daemon and organization preflight arguments', async t => {
  const env = await home(t);
  for (const args of [
    ['--version'],
    ['app-server', 'daemon', 'version'],
    ['-c', 'features.code_mode_host=true', 'app-server', '--print-startup-config',
      '--startup-client-info', '{"name":"codex_desktop","title":"Codex Desktop"}'],
  ]) {
    const { stdout } = await run(wrapper, args, { env });
    assert.equal(stdout, args.join('\n') + '\n');
  }
});

test('rejects unknown startup overrides without echoing their values', async t => {
  const env = await home(t);
  await assert.rejects(run(wrapper, ['app-server', '-c', 'example.secret=do-not-print'], { env }), error => {
    assert.equal(error.code, 64);
    assert.match(error.stderr, /Unsupported Desktop startup override/);
    assert.ok(!error.stderr.includes('do-not-print'));
    return true;
  });
});
