// ClioTalk's public Website AI route, exercised through the real composer.
// This is intentionally a browser test: a source-level event-listener check
// cannot prove that typing enables Send or that Enter/click reaches transport.

import { expect, test } from "@playwright/test";
import { createFakeModelServer } from "./fake-model.mjs";
import {
  bootApp,
  createProject,
  dismissGuide,
  openWindow,
} from "./helpers.mjs";

let fakeModel;
let fakeModelPort;

test.beforeAll(async () => {
  fakeModel = createFakeModelServer();
  fakeModelPort = await fakeModel.listen();
});

test.afterAll(async () => {
  await fakeModel.close();
});

function cloudStream(text) {
  return [
    `data: ${JSON.stringify({
      id: "chatcmpl-clio-e2e",
      object: "chat.completion.chunk",
      model: "deepseek-v4-flash",
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "chatcmpl-clio-e2e",
      object: "chat.completion.chunk",
      model: "deepseek-v4-flash",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 },
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
}

test("ClioTalk Website AI sends with Enter and the Send button", async ({ page }) => {
  const submittedPrompts = [];

  await page.route("**/api/capabilities", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        deployment_profile: "public",
        public_deployment: true,
        public_access: {
          turnstile_required: true,
          turnstile_site_key: "e2e-site-key",
          turnstile_action: "turnstile-spin-v2",
        },
        features: { cloud_shared: true, cloud_byok: true },
      }),
    });
  });
  await page.route("**/api/session/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ verified: true }),
    });
  });
  await page.route("**/api/cloud/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ connected: true, credential_mode: "shared" }),
    });
  });
  await page.route("**/api/cloud/chat", async (route) => {
    const payload = route.request().postDataJSON();
    const latestUserMessage = [...(payload.messages || [])]
      .reverse()
      .find((message) => message?.role === "user");
    submittedPrompts.push(String(latestUserMessage?.content || ""));
    const replyText = `网站 AI 已收到第 ${submittedPrompts.length} 条消息。`;
    if (!payload.stream) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "chatcmpl-clio-e2e",
          object: "chat.completion",
          model: "deepseek-v4-flash",
          choices: [{
            index: 0,
            message: { role: "assistant", content: replyText },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: 8, completion_tokens: 8, total_tokens: 16 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: cloudStream(replyText),
    });
  });

  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "ClioTalk E2E Project");

  // Reconnect through the same Website AI control shown in the reported UI.
  // The simple status must settle; it may never remain on "Connecting…" once
  // the detailed connection check has completed.
  await openWindow(page, "control");
  await page.click("#use-website-ai");
  await expect(page.locator("#simple-ai-status")).toContainText(/Connected|已连接/);
  await expect(page.locator("#simple-ai-status")).not.toContainText(/Connecting|正在连接/);
  await page.click('[data-window="control"] .close-box');

  await openWindow(page, "assistant");
  const prompt = page.locator("#prompt");
  const send = page.locator("#send");

  await prompt.fill("你好，验证 Enter 发送");
  await expect(send).toBeEnabled();
  await prompt.press("Enter");
  await expect(page.locator("#messages .message.user .message-content").last()).toContainText("你好，验证 Enter 发送");
  await expect(page.locator("#messages .message.assistant .message-content").last()).toContainText("网站 AI 已收到第 1 条消息");

  await prompt.fill("你好，验证按钮发送");
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator("#messages .message.user .message-content").last()).toContainText("你好，验证按钮发送");
  await expect(page.locator("#messages .message.assistant .message-content").last()).toContainText("网站 AI 已收到第 2 条消息");

  const composerPrompts = submittedPrompts.filter((value) => value.startsWith("你好，验证"));
  expect(composerPrompts).toEqual([
    expect.stringContaining("你好，验证 Enter 发送"),
    expect.stringContaining("你好，验证按钮发送"),
  ]);
});

test("ClioTalk sends through a connected local model", async ({ page }) => {
  test.setTimeout(90_000);
  const responsesCallsBefore = fakeModel.state.responsesCalls;
  const nativeCallsBefore = fakeModel.state.nativeChatCalls;
  fakeModel.setScenario("json");

  await bootApp(page);
  await dismissGuide(page);
  await createProject(page, "ClioTalk Local E2E Project");

  // Connect through the real Control Panel controls, not an internal state
  // override, so model discovery and ClioTalk readiness are both exercised.
  await openWindow(page, "control");
  await page.click("#control-tab-local");
  const manualConnection = page.locator("#local-manual-connection");
  if (!await manualConnection.evaluate((element) => element.open)) {
    await manualConnection.locator(":scope > summary").click();
  }
  await expect(manualConnection).toHaveJSProperty("open", true);
  const modelFields = page.locator(".local-model-fields");
  if (await modelFields.isVisible()) {
    await page.click("#connect-local-model");
    await expect(modelFields).toBeHidden();
  }
  await expect(page.locator("#endpoint")).toBeVisible();
  await page.fill("#endpoint", `http://127.0.0.1:${fakeModelPort}`);
  await page.click("#connect-local-model");
  await expect(modelFields).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#local-connection-status")).toContainText(/Connected|已连接|连接成功/i, { timeout: 20_000 });
  await page.waitForFunction(
    () => (document.querySelector("#model")?.value || "").trim() !== "",
    undefined,
    { timeout: 20_000 }
  );

  // A tool-free request takes the native /api/v1/chat path and is adapted
  // back into the app's shared response shape without losing response_id.
  const nativeResult = await page.evaluate(async () => {
    const response = await window.AISystem6LocalLMStudio.chat({
      model: document.querySelector("#model")?.value || "",
      messages: [
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Native v1 transport check" },
      ],
      stream: false,
    });
    return response.json();
  });
  expect(fakeModel.state.nativeChatCalls).toBeGreaterThan(nativeCallsBefore);
  expect(nativeResult.ai_system6_lmstudio_api).toBe("lmstudio-native-v1");
  expect(nativeResult.ai_system6_lmstudio_response_id).toMatch(/^resp_fake_/);
  await page.click('[data-window="control"] .close-box');

  await openWindow(page, "assistant");
  const prompt = page.locator("#prompt");
  const send = page.locator("#send");
  await prompt.fill("你好，验证本地 AI 发送");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(page.locator("#messages .message.user .message-content").last()).toContainText("你好，验证本地 AI 发送");
  await expect(page.locator("#messages .message.assistant .message-content").last()).toContainText("背景");
  expect(fakeModel.state.responsesCalls).toBeGreaterThan(responsesCallsBefore);
  expect(fakeModel.state.lastResponsesBody).toMatchObject({
    model: "fake-model-7b",
    // Ordinary chat streams by design so the first visible words arrive
    // before a long local answer has finished.
    stream: true,
    store: true,
  });
  expect(fakeModel.state.lastResponsesBody.tools.length).toBeGreaterThan(0);
  expect(JSON.stringify(fakeModel.state.lastResponsesBody.input)).toContain("你好，验证本地 AI 发送");

  const firstResponseId = `resp_responses_${fakeModel.state.responsesCalls}`;
  await prompt.fill("继续验证本地多轮对话");
  await send.click();
  await expect(page.locator("#messages .message.assistant .message-content").last()).toContainText("背景");
  expect(fakeModel.state.lastResponsesBody.previous_response_id).toBe(firstResponseId);
  expect(JSON.stringify(fakeModel.state.lastResponsesBody.input)).toContain("继续验证本地多轮对话");
});
