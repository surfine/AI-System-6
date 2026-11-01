// A failed or missing retry must fail the cell before any PNG comparison.
export function retryShootability(record, exists) {
  if (record?.missing) {
    return { ok: false, reason: `retry did not mount (${record.why || "no reason recorded"})` };
  }
  if (!record) {
    return { ok: false, reason: "retry returned no record" };
  }
  if (!exists) {
    return { ok: false, reason: "retry produced no PNG" };
  }
  return { ok: true };
}
