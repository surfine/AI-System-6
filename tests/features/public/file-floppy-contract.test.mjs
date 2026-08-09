// Public-safe File Floppy contract: mount → files visible → project scoping →
// eject. No private corpus or fixtures.

import { createFeatureTest, read } from "../../helpers/feature-test-harness.mjs";

const test = createFeatureTest("public-file-floppy");
const html = read("index.html");
const fileDisk = read("app/features/file-disk.js");
const app = read("app.js");
const actions = read("app/core/actions.js");

test.assertIncludes(html, 'id="mounted-text-disk"', "File Floppy has a mounted disk surface on the desktop");
test.assertIncludes(html, 'data-system-icon="fileFloppy"', "File Floppy uses the floppy object icon");
test.assertIncludes(app, "function insertFileFloppyFromWindow", "File Floppy can be mounted");
test.assertIncludes(fileDisk, "function ejectTextDisk", "File Floppy can be ejected");
test.assertIncludes(fileDisk, "mountedTextDisk.files", "mounted files are visible on the disk surface");
test.assertIncludes(fileDisk, "mountedTextDisk.projectId", "File Floppy files are scoped to the active project");
test.assertIncludes(fileDisk, "function renderMountedTextDisk", "the desktop re-renders the mounted disk surface");
test.assertIncludes(actions, '"eject-text-disk": ejectTextDisk', "eject is a real command");
test.assertIncludes(actions, '"insert-text-disk": insertFileFloppyFromWindow', "mounting a disk is a real command");

test.finish();
