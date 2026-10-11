'use strict';
// Fixed native executables only; the page never supplies argv. A detached
// group plus parent heartbeat prevents an interactive capture/dialog orphan.
const { spawn } = require('node:child_process');
const allowed = new Set(['/usr/sbin/screencapture', '/usr/bin/osascript']);
async function execute(argv, parentPid) {
  if (!allowed.has(argv[0]) || !Number.isSafeInteger(parentPid) || parentPid < 2) throw new Error('Invalid native command');
  const child = spawn(argv[0], argv.slice(1), { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = '', stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (Number.isSafeInteger(child.pid) && child.pid > 1) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
  };
  child.stdout.on('data', bytes => { output += bytes.toString(); if (output.length > 1024 * 1024) stop(); });
  child.stderr.on('data', bytes => { error += bytes.toString(); if (error.length > 1024 * 1024) stop(); });
  const timer = setInterval(() => { try { process.kill(parentPid, 0); } catch { stop(); } }, 500);
  const timeout = setTimeout(stop, 300000);
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    return { code: code ?? -1, stdout: output, stderr: error };
  } finally { clearInterval(timer); clearTimeout(timeout); stop(); }
}
if (require.main === module) execute(process.argv.slice(3), Number(process.argv[2]))
  .then(value => process.stdout.write(JSON.stringify(value)))
  .catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
module.exports = { execute };
