import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createFeatureTest } from '../helpers/feature-test-harness.mjs';
const test = createFeatureTest('tinyjs-transaction');
const require = createRequire(import.meta.url);
const worker = require('../../platform/macos/tinyjs/src/node/update.cjs');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.log('SKIP real application transaction: arm64 macOS required.');
} else {
  const root = await mkdtemp(join(tmpdir(), 'system6-transaction-'));
  try {
    async function bundle(folder, info, ready, healthyFile, dataFingerprint, dir) {
      await mkdir(join(folder, 'Contents/MacOS'), { recursive: true }); await mkdir(join(folder, 'Contents/Resources'));
      const prefix = JSON.stringify({ ...info, ready, dataFingerprint }).slice(0,-1) + ',';
      const code = '#include <stdio.h>\n#include <sys/time.h>\n#include <unistd.h>\nint main(){struct timeval t;gettimeofday(&t,0);FILE*f=fopen(' + JSON.stringify(healthyFile) + ',"w");if(!f)return 1;fputs(' + JSON.stringify(prefix) + ',f);fprintf(f,"\\\"time\\\":%lld,\\\"backendPid\\\":%d,\\\"supervisorPid\\\":%d}",(long long)t.tv_sec*1000+t.tv_usec/1000,getpid(),getpid());fclose(f);return 0;}';
      await writeFile(join(dir,'main.c'), code);
      execFileSync('/usr/bin/clang', ['-target','arm64-apple-macos15.0',join(dir,'main.c'),'-o',join(folder,'Contents/MacOS/Shell')]);
      await writeFile(join(folder,'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>me.aaronlau.ai-system6.transaction-test</string><key>CFBundleExecutable</key><string>Shell</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
      await writeFile(join(folder,'Contents/Resources/PRODUCT-IDENTITY.json'),JSON.stringify(info));
      execFileSync('/usr/bin/codesign',['--force','--sign','-',folder],{stdio:'pipe'});
    }
    for (const outcome of ['healthy', 'restored', 'interrupted']) {
      const dir = join(root, outcome); await mkdir(dir);
      const home = join(dir, '.ai-system6-update-test'); await mkdir(home);
      const app = join(dir, 'Current.app'), candidate = join(home, 'Next.app');
      const healthyFile = join(dir, 'health.json');
      const dataFingerprint = 'c'.repeat(64);
      const oldIdentity = { shellVersion: '1.0.0', productVersion: '1.0.59', productBuild: '20261011.1', storageSchema: 6, sourceCommit: 'a'.repeat(40) };
      const identity = { ...oldIdentity, shellVersion: '1.0.1', productBuild: '20261011.2', sourceCommit: 'b'.repeat(40) };
      await bundle(app,oldIdentity,true,healthyFile,dataFingerprint,dir);await bundle(candidate,identity,outcome==='healthy',healthyFile,dataFingerprint,dir);
      // Owned placeholders represent the old backend and supervisor.
      const old = [spawn(process.execPath,['-e','setInterval(()=>{},1000)']),spawn(process.execPath,['-e','setInterval(()=>{},1000)'])];
      const pids = old.map(p=>p.pid);
      await Promise.all(old.map(p=>new Promise(resolve=>{p.once('exit',resolve);p.kill('SIGTERM');})));
      const state = { phase:'prepared',app,candidate,backup:join(home,'previous.app'),home,oldBackendPid:pids[0],oldSupervisorPid:pids[1],oldIdentity,identity,dataFingerprint,healthyFile,recoveryFile:join(dir,'recovery.json') };
      if(outcome==='interrupted') { await (await import('node:fs/promises')).rename(app,state.backup); /* rename happened before journal write */ }
      await writeFile(join(home,'transaction.json'),JSON.stringify(state));
      await writeFile(state.recoveryFile,JSON.stringify({home}));
      const result=await worker.install(home);
      assert.equal(result.status,outcome==='healthy'?'healthy':'restored');
      const actual=JSON.parse(await readFile(join(app,'Contents/Resources/PRODUCT-IDENTITY.json')));
      assert.equal(actual.shellVersion,outcome==='healthy'?identity.shellVersion:oldIdentity.shellVersion);
      const health=JSON.parse(await readFile(healthyFile));assert.equal(health.dataFingerprint,dataFingerprint);assert.equal(health.ready,true);
      await assert.rejects(readFile(state.recoveryFile),{code:'ENOENT'});
      // A healthy install leaves no private updater copy next to the app; a restored one keeps it for diagnosis.
      assert.equal(await stat(home).then(()=>true,()=>false),outcome!=='healthy');
      console.log('Actual swap/restart transaction:',outcome,'passed');
    }
    {
      const dir = join(root, 'restored-before-journal'); await mkdir(dir);
      const home = join(dir, '.ai-system6-update-recovery'); await mkdir(home);
      const app = join(dir, 'Current.app');
      const oldIdentity = { shellVersion: '1.0.0', productVersion: '1.0.59', productBuild: '20261011.1', storageSchema: 6, sourceCommit: 'a'.repeat(40) };
      const healthyFile = join(dir, 'health.json'), fingerprint = 'd'.repeat(64);
      await bundle(app, oldIdentity, true, healthyFile, fingerprint, dir);
      const recoveryFile = join(dir, 'recovery.json');
      const state = { phase: 'restoring', app, backup: join(home, 'previous.app'), home, oldIdentity };
      await writeFile(join(home, 'transaction.json'), JSON.stringify(state));
      await writeFile(recoveryFile, JSON.stringify({ home }));
      const recovered = await worker.recover({ app, recoveryFile });
      assert.deepEqual(recovered, { recovering: false, restored: true });
      assert.equal(JSON.parse(await readFile(join(home, 'transaction.json'))).phase, 'restored');
      await assert.rejects(readFile(recoveryFile), { code: 'ENOENT' });
    }
    test.assert(true,'real application swap, unhealthy rollback and interrupted rename recovery preserve expected identity/data');
    test.assert(true,'a completed filesystem restore with a stale recovery marker does not loop or block the known previous app');
  } finally {await rm(root,{recursive:true,force:true});}
}
test.finish();
