// @ts-check
// A development instrument, not a feature: what a save plan that trusted only
// the writers would have missed.
//
// The plan fingerprints every record on the desk so that an in-place edit
// nothing marked is still written. Skipping that scan for records that report
// themselves would make a save cost what the edit cost instead of what the
// desk weighs - but only once EVERY writer reports. So the comparison runs the
// two plans over the same state and records the difference, which turns "are
// the writers done?" into a measured list rather than an opinion.
//
// It reads, never writes, is off unless a caller switches it on, and travels
// with the check rather than with the desk: the shipped bundle carries two
// one-line hooks into this file and nothing else. Contract:
// tests/e2e/scan-shadow.spec.mjs.

window.AISystem6ScanShadow = (() => {
  let enabled = false;
  let installed = false;
  let comparisons = 0;
  let mismatches = [];
  // One record per save in flight. A save can be entered while another is
  // still inside its own await (the import does exactly that), and sharing one
  // set of variables attributed the inner save's plan to the outer one's
  // report snapshot - which reads as a missed writer that does not exist.
  const saves = [];
  const currentSave = () => saves[saves.length - 1] || null;
  // What the app has SAID changed, per collection, since the last plan looked.
  //
  // Asking the save's own dirty register instead would hide writers: that
  // register is cleared by whatever commit happens to write a record, so a
  // record marked once for any reason made every unmarked edit on it
  // invisible. This register holds only what writers reported between two plan
  // builds, which is the set a report-only plan would actually trust.
  let reported = new Map();
  // Every record any writer has ever reported as deleted this session. A plan
  // keeps its tombstone for a record the desk has already removed (that entry
  // is what tells a late announcement apart from a new record - dropping it is
  // what made a remote delete come back), so the same delete is offered again
  // on the next save. That echo is not a writer nobody migrated: the delete was
  // reported once, and the plan is repeating it.
  const reportedDeletes = new Set();

  /** @param {string} kind @param {string} recordId @param {boolean} [deleted] */
  function noteChanged(kind, recordId, deleted = false) {
    if (!kind || kind === "settings") return;
    const entry = reported.get(kind) || { puts: new Set(), deletes: new Set(), all: false };
    if (!recordId) entry.all = true;
    else if (deleted) {
      entry.deletes.add(String(recordId));
      reportedDeletes.add(`${kind}:${recordId}`);
    } else {
      entry.puts.add(String(recordId));
    }
    reported.set(kind, entry);
  }

  /** The reports collected since the last plan, and a fresh register behind them. */
  function takeReported() {
    const taken = reported;
    reported = new Map();
    return taken;
  }

  /**
   * Hook the desk's own functions. The desk ships no instrument code: this
   * file attaches itself to the save plan and to the two "I changed this"
   * entry points when it is loaded, and the wrapper is transparent while the
   * comparison is off.
   */
  function install() {
    if (installed) return;
    installed = true;
    const dirty = window.markDeskDirty;
    const deleted = window.markDeskDeleted;
    const plan = window.deskCollectionPlan;
    const persist = window.persistDeskState;
    const definitions = window.deskCollectionDefinitions;
    if (typeof dirty === "function") {
      window.markDeskDirty = function markDeskDirty(kind = "settings", recordId = "") {
        noteChanged(kind, recordId);
        return dirty.call(this, kind, recordId);
      };
    }
    if (typeof deleted === "function") {
      window.markDeskDeleted = function markDeskDeleted(kind, recordId) {
        noteChanged(kind, recordId, true);
        return deleted.call(this, kind, recordId);
      };
    }
    if (typeof plan === "function") {
      window.deskCollectionPlan = function deskCollectionPlan(definition) {
        const built = plan.call(this, definition);
        currentSave()?.plans.push(built);
        return built;
      };
    }
    if (typeof definitions === "function") {
      // The report snapshot has to be taken where the save is about to look at
      // the desk - after its own setup pass has run, not when it was entered.
      // Otherwise a mark made during that pass (the migration above does
      // exactly that) belongs to the next save and this one looks untouched.
      window.deskCollectionDefinitions = function deskCollectionDefinitions(...args) {
        const save = currentSave();
        if (enabled && save && !save.said) {
          save.said = takeReported();
          save.bases = typeof storageRecordFingerprintCache !== "undefined"
            ? new Map([...storageRecordFingerprintCache].map(([key, map]) => [key, new Map(map)]))
            : new Map();
        }
        return definitions.apply(this, args);
      };
    }
    if (typeof persist === "function") {
      window.persistDeskState = async function persistDeskState(...args) {
        const save = { said: null, bases: new Map(), plans: [] };
        saves.push(save);
        try {
          return await persist.apply(this, args);
        } finally {
          saves.pop();
          if (enabled && save.said) save.plans.forEach((built) => compare(built, save.said, save.bases));
        }
      };
    }
  }

  function enable() {
    install();
    enabled = true;
    comparisons = 0;
    mismatches = [];
    return () => { enabled = false; };
  }

  /** Whether the comparison is on - the save plan asks before it trusts anything. */
  function isEnabled() {
    return enabled;
  }

  function report() {
    // A miss on a collection whose writers have all been migrated is a
    // regression; the same miss on a collection that is still covered by the
    // full scan is the migration list. The total counts the first kind, so the
    // gate fails on a regression and stays honest about the second, which is
    // named in `notYetMigrated` instead of being hidden.
    return {
      enabled,
      comparisons,
      totalMissed: mismatches.reduce(
        (total, entry) => total + (entry.trusted === false
          ? 0
          : entry.missedPuts.length + entry.missedDeletes.length),
        0
      ),
      notYetMigrated: mismatches.filter((entry) => entry.trusted === false).map((entry) => ({
        key: entry.key,
        count: entry.missedPuts.length + entry.missedDeletes.length,
      })),
      mismatches: mismatches.map((entry) => ({
        key: entry.key,
        trusted: entry.trusted !== false,
        missedPuts: [...entry.missedPuts],
        missedDeletes: [...entry.missedDeletes],
        fields: [...(entry.fields || [])],
      })),
    };
  }

  /** Which top-level fields moved since the cached version - names only. */
  function changedFieldNames(cachedFingerprint, item) {
    if (!cachedFingerprint) return ["(new record)"];
    try {
      const before = JSON.parse(cachedFingerprint);
      return Object.keys({ ...before, ...item }).filter(
        (field) => JSON.stringify(before?.[field]) !== JSON.stringify(item?.[field])
      );
    } catch {
      return ["(unreadable base)"];
    }
  }

  /**
   * Compare one plan with what the writers said, and record what was missed.
   *
   * The fingerprint cache and the record-identity rule belong to the desk, and
   * this file runs in the same realm as a classic script: it reads them by
   * name rather than being handed copies that could drift.
   *
   * @param {{key: string, items: any[], puts: Array<{id: any, item: any}>, deletes: Array<{id: any}>}} plan
   * @param {Map<string, {puts: Set<string>, deletes: Set<string>, all: boolean}>} said
   */
  function compare(plan, said, basesSnapshot) {
    if (!enabled) return;
    const entry = said.get(plan.key) || { puts: new Set(), deletes: new Set(), all: false };
    const previous = storageRecordFingerprintCache.get(plan.key) || new Map();
    const before = basesSnapshot?.get(plan.key) || new Map();
    const currentIds = new Set(
      (plan.items || []).map((item, index) => String(deskRecordIdentity(plan.key, item, index)))
    );
    // The bases are the ones the plan itself compared against. Reading the
    // cache after the commit would call a record written for the first time
    // "known" and report the creation as a missed writer.
    const bases = before.size ? before : previous;
    const trustedPuts = new Set(
      [...currentIds].filter((id) => entry.all || entry.puts.has(id) || !bases.has(id))
    );
    // A put whose fields all match the base moved only in key order: the same
    // record written with its keys in a different sequence. Nothing a writer
    // had to announce was lost, so it is not a missed report.
    const missedPuts = plan.puts
      .filter((put) => !trustedPuts.has(String(put.id)))
      .filter((put) => changedFieldNames(bases.get(String(put.id))?.fingerprint, put.item).length > 0)
      .map((put) => String(put.id));
    const missedDeletes = plan.deletes
      .map((item) => String(item.id))
      .filter((id) => !entry.deletes.has(id) && !reportedDeletes.has(`${plan.key}:${id}`));
    comparisons += 1;
    if (!missedPuts.length && !missedDeletes.length) return;
    // Which collections the save plan actually trusts. Read by name from the
    // desk: the list is the desk's, and the check should not carry a copy.
    const trusted = typeof trustedKeys !== "undefined" && trustedKeys.includes(plan.key);
    const fields = plan.puts
      .filter((put) => missedPuts.includes(String(put.id)))
      .flatMap((put) => changedFieldNames(bases.get(String(put.id))?.fingerprint, put.item));
    mismatches.push({ key: plan.key, trusted, missedPuts, missedDeletes, fields: [...new Set(fields)] });
  }

  return Object.freeze({ enable, isEnabled, report, install });
})();
