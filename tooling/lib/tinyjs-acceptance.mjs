import path from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { createPathManifest, sha256File } from './release-receipt.mjs';

// These are observations of the packaged product, not the source test suite.
// The controller supplies sanitized evidence after exercising these interfaces.
export const TINYJS_ACCEPTANCE_CHECKS = Object.freeze([
  'startup-and-exit', 'old-data-migration', 'keychain-migration',
  'clipboard-opt-in', 'selection-and-ocr', 'quick-look',
  'downloads-and-cancellation', 'notifications-and-deep-links',
  'full-product-ota', 'ota-save-barrier', 'ota-health-rollback',
]);

export function validateAcceptanceRecord(record, identity, archiveSha256, appSha256) {
  if (record?.schema !== 'ai-system-6/tinyjs-acceptance/v1' || record.status !== 'pass'
      || record.sourceCommit !== identity.sourceCommit || record.productVersion !== identity.productVersion
      || record.productBuild !== identity.productBuild || record.shellVersion !== identity.shellVersion
      || record.archiveSha256 !== archiveSha256 || record.appSha256 !== appSha256
      || !/^[a-f0-9]{64}$/.test(archiveSha256) || !/^[a-f0-9]{64}$/.test(appSha256)
      || !Number.isFinite(Date.parse(record.verifiedAt))
      || Date.parse(record.verifiedAt) > Date.now() + 300000) {
    throw new Error('TinyJS acceptance identity does not match the final application');
  }
  if (!Array.isArray(record.checks) || record.checks.length !== TINYJS_ACCEPTANCE_CHECKS.length) {
    throw new Error('TinyJS packaged-product acceptance is incomplete');
  }
  const names = new Set();
  for (const check of record.checks) {
    if (!TINYJS_ACCEPTANCE_CHECKS.includes(check?.name) || names.has(check.name) || check.status !== 'pass'
        || typeof check.evidence !== 'string' || !/^evidence\/[a-z0-9][a-z0-9._-]*\.(json|txt|png)$/.test(check.evidence)
        || !/^[a-f0-9]{64}$/.test(check.sha256 || '')) {
      throw new Error('TinyJS acceptance requires a distinct passed observation and evidence for every interface');
    }
    names.add(check.name);
  }
  return record;
}

export async function validatePackagedAcceptance(macDirectory) {
  const metadata = JSON.parse(await readFile(path.join(macDirectory, 'tinyjs-version-metadata.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(macDirectory, 'tinyjs-ota-manifest.json'), 'utf8'));
  const record = JSON.parse(await readFile(path.join(macDirectory, 'tinyjs-acceptance.json'), 'utf8'));
  const archiveSha256 = await sha256File(path.join(macDirectory, 'AI System 6 Beta.zip'));
  if (archiveSha256 !== manifest.sha256) throw new Error('TinyJS archive changed before acceptance');
  const app = await createPathManifest(macDirectory, 'AI System 6 Beta.app');
  validateAcceptanceRecord(record, metadata.identity, archiveSha256, app.sha256);
  const evidenceDirectory = await lstat(path.join(macDirectory, 'evidence'));
  if (!evidenceDirectory.isDirectory() || evidenceDirectory.isSymbolicLink()) throw new Error('Unsafe TinyJS evidence directory');
  for (const check of record.checks) {
    const evidence = path.join(macDirectory, check.evidence);
    const info = await lstat(evidence);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 10 * 1024 * 1024
        || await sha256File(evidence) !== check.sha256) throw new Error('TinyJS acceptance evidence changed: ' + check.name);
  }
  return record;
}
