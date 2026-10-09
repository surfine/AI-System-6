// The one way a capture tool takes local models out of the picture.
//
// The desk does not ask LM Studio or Ollama directly: it asks this app's own
// server (/api/v1/models, /api/models), which then asks them. A stub on the
// :1234/:11434 ports alone therefore stubbed nothing, and every capture
// depended on whether the build machine's shared LM Studio had a model loaded
// at that moment — the menu bar named the model, ClioTalk's send button
// changed state, and the token tables' `.btn` multisets moved between two
// runs of the same tree. tests/features/appearance-token-check.test.mjs keeps
// tools from writing their own port-only stub again.
//
// Each answer is the one a machine with no local model gives.
export async function stubLocalModels(context) {
  await context.route(/https?:\/\/(?:127\.0\.0\.1|localhost):(?:1234|11434)\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) }));
  await context.route(/\/api\/v1\/models(?:\?|$)/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: [] }) }));
  await context.route(/\/api\/models(?:\?|$)/, (route) =>
    route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Model discovery failed", detail: "no local model during capture" }) }));
}
