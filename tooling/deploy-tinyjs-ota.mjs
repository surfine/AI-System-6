// Publish only sealed release bytes. The versioned archive is immutable;
// canary is read back before the stable pointer changes.
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { validatePackagedAcceptance } from './lib/tinyjs-acceptance.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndValidateReleaseReceipt } from './lib/release-receipt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://system6.aaronlau.me';
// The production host is deployment detail, never source: a published
// repository must not carry the IP or the ssh login. The publish step sets
// AI_SYSTEM6_DEPLOY_HOST (user@host) and this refuses without it.
// Resolved where it is used, not at import: the publish policy tests import
// this module without any deployment environment.
function deployHost() {
  const host = String(process.env.AI_SYSTEM6_DEPLOY_HOST || '').trim();
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('AI_SYSTEM6_DEPLOY_HOST must name the OTA host as user@host');
  }
  return host;
}

const docroot = '/home/admin/web/system6.aaronlau.me/public_html';
const include = '/home/admin/conf/web/system6.aaronlau.me/nginx.ssl.conf_ai-system6-ota';
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(command + ' failed: ' + (result.stderr || result.error?.message || 'unknown error'));
  return result.stdout.trim();
}
const remote = script => run('ssh', ['-o', 'BatchMode=yes', deployHost(), 'sh', '-s'], 'set -eu\n' + script);
export async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
/** The updater installs this zip as-is, so it must be the Developer ID notarized build. */
export function assertNotarized(metadata) {
  if (metadata?.signing?.mode !== 'developer-id' || metadata?.signing?.notarized !== true) {
    throw new Error('OTA archive is not the Developer ID notarized build; refusing to publish it');
  }
}
export function validateManifest(manifest, identity) {
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '') || manifest.version !== identity.shellVersion
      || !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') || !Number.isSafeInteger(manifest.size) || manifest.size < 1
      || manifest.product?.commit !== identity.sourceCommit || manifest.product?.version !== identity.productVersion
      || manifest.product?.build !== identity.productBuild) throw new Error('OTA manifest identity differs');
  const url = new URL(manifest.url);
  if (url.origin !== origin || url.search || url.hash || url.username || url.password
      || url.pathname !== `/updates/releases/${manifest.version}/ai-system-6-beta-${manifest.version}-arm64.zip`) {
    throw new Error('Unexpected OTA archive URL');
  }
  return url.pathname;
}
async function readManifest(channel) {
  const response = await fetch(`${origin}/updates/${channel}/manifest.json?verify=${randomUUID()}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('OTA readback HTTP ' + response.status);
  return response.json();
}
async function archiveReadback(url, expectedHash, expectedSize) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error('OTA archive HTTP ' + response.status);
  const hash = createHash('sha256'); let size = 0;
  for await (const bytes of response.body) {
    size += bytes.length;
    if (size > expectedSize) throw new Error('OTA archive exceeds sealed size');
    hash.update(bytes);
  }
  if (size !== expectedSize || hash.digest('hex') !== expectedHash) throw new Error('Public OTA bytes differ from sealed archive');
}
export async function publishOta(receiptPath) {
  const head = run('git', ['-C', root, 'rev-parse', 'HEAD']);
  const loaded = await loadAndValidateReleaseReceipt(receiptPath, { repositoryRoot: root, requireCommit: head, requiredTargets: ['mac', 'web'] });
  const mac = path.join(loaded.receiptDirectory, 'artifacts/mac');
  const metadata = JSON.parse(await readFile(path.join(mac, 'tinyjs-version-metadata.json')));
  const identity = metadata.identity;
  assertNotarized(metadata);
  const manifestFile = path.join(mac, 'tinyjs-ota-manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile));
  const archivePath = validateManifest(manifest, identity);
  const archive = path.join(mac, 'AI System 6 Beta.zip');
  if (identity.sourceCommit !== loaded.receipt.source.commit || identity.productBuild !== loaded.receipt.release.build
      || identity.productVersion !== loaded.receipt.release.version || await fileHash(archive) !== manifest.sha256) throw new Error('OTA artifact differs from receipt');
  // The final packaged application acceptance must be included in the seal,
  // unless the owner overrode it: prepare then sealed the reason beside the
  // artifacts as ACCEPTANCE-OVERRIDE.txt, and this step reads that record
  // instead of the missing observations.
  let overrideReason = "";
  try {
    const record = await readFile(path.join(mac, "ACCEPTANCE-OVERRIDE.txt"), "utf8");
    overrideReason = (record.split("\n")[1] || "owner override").replace(/^Reason:\s*/, "");
    console.log(`  packaged acceptance overridden: ${overrideReason}`);
  } catch {
    await validatePackagedAcceptance(mac);
  }
  const local = await mkdtemp(path.join(tmpdir(), 'system6-ota-publish-'));
  const stage = '/root/ai-system6-ota-' + randomUUID();
  try {
    remote(`mkdir -m 700 ${quote(stage)}`);
    run('scp', ['-q', archive, deployHost() + ':' + stage + '/archive.zip']);
    run('scp', ['-q', manifestFile, deployHost() + ':' + stage + '/manifest.json']);
    if (remote(`sha256sum ${quote(stage + '/archive.zip')}`).split(/\s/)[0] !== manifest.sha256) throw new Error('Uploaded OTA checksum differs');
    const config = `# Generated by sealed TinyJS release publisher.\nlocation = /updates/stable/manifest.json { root ${docroot}; expires -1; add_header X-Content-Type-Options nosniff always; }\nlocation = /updates/canary/manifest.json { root ${docroot}; expires -1; add_header X-Content-Type-Options nosniff always; }\nlocation ~ ^/updates/releases/[0-9]+\\.[0-9]+\\.[0-9]+/ai-system-6-beta-[0-9]+\\.[0-9]+\\.[0-9]+-arm64\\.zip$ { root ${docroot}; try_files $uri =404; expires max; add_header X-Content-Type-Options nosniff always; }\nlocation /updates/ { return 404; }\n`;
    await writeFile(path.join(local, 'nginx.conf'), config);
    run('scp', ['-q', path.join(local, 'nginx.conf'), deployHost() + ':' + stage + '/nginx.conf']);
    remote(`if test -e ${quote(include)}; then cp -p ${quote(include)} ${quote(stage + '/previous-nginx.conf')}; sha256sum ${quote(stage + '/previous-nginx.conf')}; fi
cp ${quote(stage + '/nginx.conf')} ${quote(include)}
if ! nginx -t; then
  if test -e ${quote(stage + '/previous-nginx.conf')}; then cp ${quote(stage + '/previous-nginx.conf')} ${quote(include)}; else rm ${quote(include)}; fi
  exit 1
fi
systemctl reload nginx
mkdir -p ${quote(docroot + '/updates/releases/' + manifest.version)} ${quote(docroot + '/updates/canary')} ${quote(docroot + '/updates/stable')}
if test -e ${quote(docroot + archivePath)}; then
  if test "$(sha256sum ${quote(docroot + archivePath)} | cut -d ' ' -f 1)" != ${quote(manifest.sha256)}; then
    mv ${quote(docroot + archivePath)} ${quote(docroot + archivePath + '.previous-' + Date.now())}
  fi
fi
if ! test -e ${quote(docroot + archivePath)}; then
  cp ${quote(stage + '/archive.zip')} ${quote(docroot + archivePath + '.tmp')}
  chmod 644 ${quote(docroot + archivePath + '.tmp')}
  mv ${quote(docroot + archivePath + '.tmp')} ${quote(docroot + archivePath)}
fi
cp ${quote(stage + '/manifest.json')} ${quote(docroot + '/updates/canary/manifest.json.tmp')}
chmod 644 ${quote(docroot + '/updates/canary/manifest.json.tmp')}
mv ${quote(docroot + '/updates/canary/manifest.json.tmp')} ${quote(docroot + '/updates/canary/manifest.json')}`);
    if (JSON.stringify(await readManifest('canary')) !== JSON.stringify(manifest)) throw new Error('Canary manifest differs');
    await archiveReadback(manifest.url, manifest.sha256, manifest.size);
    remote(`if test -e ${quote(docroot + '/updates/stable/manifest.json')}; then cp -p ${quote(docroot + '/updates/stable/manifest.json')} ${quote(stage + '/previous-stable.json')}; sha256sum ${quote(stage + '/previous-stable.json')}; fi
cp ${quote(stage + '/manifest.json')} ${quote(docroot + '/updates/stable/manifest.json.tmp')}
chmod 644 ${quote(docroot + '/updates/stable/manifest.json.tmp')}
mv ${quote(docroot + '/updates/stable/manifest.json.tmp')} ${quote(docroot + '/updates/stable/manifest.json')}`);
    try {
      if (JSON.stringify(await readManifest('stable')) !== JSON.stringify(manifest)) throw new Error('Stable manifest differs');
    } catch (error) {
      remote(`if test -e ${quote(stage + '/previous-stable.json')}; then cp ${quote(stage + '/previous-stable.json')} ${quote(docroot + '/updates/stable/manifest.json.tmp')}; mv ${quote(docroot + '/updates/stable/manifest.json.tmp')} ${quote(docroot + '/updates/stable/manifest.json')}; else rm ${quote(docroot + '/updates/stable/manifest.json')}; fi`);
      throw error;
    }
    const result = { status: 'pass', sourceCommit: head, receiptSha256: loaded.receiptSha256, archiveSha256: manifest.sha256, archiveUrl: manifest.url, channel: 'stable', remoteReceipt: stage, verifiedAt: new Date().toISOString() };
    await writeFile(path.join(loaded.receiptDirectory, 'tinyjs-ota-published.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    return result;
  } finally { await rm(local, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--verification-receipt');
  if (index < 0 || !process.argv[index + 1]) throw new Error('A sealed --verification-receipt is required');
  await publishOta(path.resolve(process.argv[index + 1]));
}
