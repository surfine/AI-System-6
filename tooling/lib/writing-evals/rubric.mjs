// The optional model-graded half. Kept apart from scorers.mjs on purpose: the
// deterministic scorers run offline and decide the product floor; this grades
// quality on a rubric and only runs with --rubric (it costs money).
// Every grader model must pass every criterion for the epoch to pass.

const clip = (text, n) => (text.length > n ? `${text.slice(0, n)}\n…[cut at ${n} characters]` : text);

export function rubricCriteriaFor(task, rubricDoc) {
  const common = (task.rubric?.criteria || []).map((id) => ({ id, text: rubricDoc.criteria[id] }));
  const extra = (task.rubric?.extra || []).map((text, i) => ({ id: `extra-${i + 1}`, text }));
  return [...common, ...extra];
}

export function buildRubricPrompt({ task, inputs, outcome, criteria, rubricDoc }) {
  const files = [...inputs].filter(([, v]) => v.text != null).map(([p, v]) => `### ${p}\n${clip(v.text, 3500)}`).join("\n\n");
  const made = [
    outcome.answer ? `## Assistant's answer\n${clip(outcome.answer, 4000)}` : "",
    ...outcome.changes.map((c) => `## File ${c.kind}: ${c.path}\n${c.text == null ? "(not text)" : clip(c.text, 4000)}`),
    ...outcome.proposals.map((p, i) => `## Proposal ${i + 1} (${p.kind}): ${p.title}\n${clip(JSON.stringify(p.payload, null, 1), 3000)}`),
  ].filter(Boolean).join("\n\n");
  return [
    rubricDoc.preamble,
    `## The writer's request\n${task.prompt}`,
    `## Files the writer's folder held\n${files}`,
    `# What the assistant produced\n${made || "(nothing)"}`,
    `## Criteria\n${criteria.map((c) => `- ${c.id}: ${c.text}`).join("\n")}`,
    rubricDoc.format,
  ].join("\n\n");
}

/** Parse the grader's JSON verdicts; anything unparseable fails closed. */
export function parseRubricReply(text, criteria) {
  let doc;
  try { doc = JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || ""); } catch { doc = null; }
  const byId = new Map((doc?.criteria || []).map((c) => [c.id, c]));
  return criteria.map((c) => {
    const v = byId.get(c.id);
    const pass = v?.verdict === "pass";
    return { id: `rubric:${c.id}`, type: "rubric", pass, detail: v ? String(v.reason || "").slice(0, 200) : "grader gave no verdict (counted as fail)" };
  });
}

/** Call one grader model through the Anthropic Messages API. Spends money. */
export async function gradeWithModel({ prompt, model, apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1200, temperature: 0, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`grader ${model}: HTTP ${res.status}`);
  const body = await res.json();
  return (body.content || []).map((b) => b.text || "").join("");
}
