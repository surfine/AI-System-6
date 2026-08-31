/** Narrow ambient contract for the classic-script Draft Desk lazy chain. */
declare const currentLanguage: string;
declare const cloudConfig: any;
declare const modelInput: HTMLInputElement | null;
declare const endpointInput: HTMLInputElement | null;
declare const mountedTextDisk: any;

declare function getWindow(name: string): any;
declare function openWindow(name: string, options?: any): Promise<any>;
declare function maximizeWindow(win: any): void;
declare function formatReviewVoiceStats(text: string): string;
declare function initSystemSelectControls(): void;
declare function refreshSystemSelectControls(): void;
declare function syncRovingTabStops(group: any): void;
declare function setControlLoading(control: any, loading: boolean, label?: string): void;
declare function setControlIdleDisabled(control: any, disabled: boolean): void;
declare function setControlIdleLabel(control: any, text: string): void;
declare function runEditCommand(command: string): Promise<void>;
declare function captureTextControlWorkingSession(target: any): any;
declare function restoreTextControlWorkingSession(target: any, state: any, options?: any): void;
declare function updateQuickDraftFocusChrome(): void;
declare function cloudCredentialReady(): boolean;
declare function cloudCredentialTransportFields(): any;
declare function sendLocalModelTask(options: any): Promise<any>;
declare function fetchModelPayload(payload: any, signal?: AbortSignal): Promise<Response>;
declare function withMarkdownModelMessages(messages: any): any;
declare function serviceErrorDetail(status: any, body?: any): string;
// The lens loads on demand, so the flow awaits this before the builder below.
// Whether a local model is actually reachable, as opposed to merely named.
declare function isLocalModelIndicatorReady(): boolean;
declare function ensureMingmingLensModule(): Promise<void>;
declare function buildMingmingRewritePrompt(options: any): string;
declare function arrangeWindowAssistantSplit(name: string): Promise<boolean>;
declare function isMultiFinderMode(): boolean;
declare function addMessage(role: string, body: string): void;
declare function markdownToSystemHtml(markdown: string): string;
// Preview anchoring lives in app/core/markdown.js; Quick Draft's reading view
// calls it the same way the writing route's surfaces do.
declare function enterPreviewAtCaret(input: any, preview: any): boolean;
declare function leavePreviewToCaret(input: any, preview: any): boolean;
declare function escapeHtml(text: string): string;
declare const translations: Record<string, Record<string, any>>;
declare function titleFromBody(body?: string): string;
// 文字亮室's durable half is lazy, so the darkroom loads it before reading for
// it. Declared here for the same reason as the image helpers below: the loader
// is eager in config.js, which this typecheck's include list does not cover.
declare function ensureDarkroomModule(): Promise<void>;
// Photographed material lives in app/core/image-attachments.js, one layer that
// every surface which can take a picture shares, so the Quick Draft chain
// reaches it the way it reaches the other classic-script globals.
declare function imageFilesFromList(files: any): File[];
declare function saveImageAttachments(records: any[]): void;
declare function imageAttachmentById(id: any): any;
declare function imageAttachmentVisionDataUrl(attachment: any): string;
declare function buildImageAttachments(files: any, options?: any): Promise<any[]>;
declare function attachImagesToModelMessages(messages: any, attachments: any, options?: any): any;
declare function attachMarkdownEditor(target: any): void;
declare function attachMarkdownHighlight(target: any): void;
declare function showSystemModal(message: string, kind?: string, options?: any): Promise<string>;
declare function closeWindow(name: string, force?: boolean): Promise<boolean>;
declare function openTransientFilePicker(options: any): void;
declare function extractFileText(file: File, options?: any): Promise<any>;
declare function ensureFolder(name: string, parentId?: string | null): any;
declare function nextAvailableProjectFileName(title: string, projectId?: string): string;
declare function setFinderEnvironment(mode: string, options?: any): Promise<boolean>;
declare function ensureRunningApp(appId: string, windowName: string): void;
declare function registerWorkingSessionAdapter(adapter: any): void;
declare function createDefaultProjectForDraftDesk(): Promise<any>;
declare function openWritingStudio(): Promise<any>;
// Which route stop the writer is at. The handoff asks so it can tell 文字亮室
// who handed a document over; window-manager.js owns the answer.
declare function currentWritingRouteStop(): string;
declare function toggleQuickDraftSideAsk(): Promise<any>;
// Length measures for the canvas frame. countTextWords and estimateVoiceoverSeconds
// live in lazy chains that may not be loaded, so the call sites guard on typeof
// and fall back to estimateBilibiliVoiceoverSeconds, which is eager.
// Preview/caret helpers from app/core/markdown.js. The Writing Studio lane
// started calling them from this chain; the declaration was missing, so checkJs
// was already reporting them before this branch. Declared, not repaired.
declare function enterPreviewAtCaret(input: any, preview: any): void;
declare function leavePreviewToCaret(input: any, preview: any): void;
declare function countTextWords(text: string): number;
declare function estimateVoiceoverSeconds(text: string): number;
declare function estimateBilibiliVoiceoverSeconds(text: string): number;

interface Window {
  AISystem6ApplicationShell?: any;
  AISystem6DarkroomRecord?: any;
  AISystem6DarkroomStore?: any;
  AISystem6ProtectedRanges?: any;
  AISystem6WriteLease?: any;
  AISystem6PasteMarkdown?: any;
  AISystem6DraftDeskPresetsLoaded?: boolean;
  AISystem6DraftDeskPresets?: any;
  AISystem6LocalLMStudio?: any;
  AISystem6TeachText?: any;
  AISystem6ReviewDesk?: any;
  AISystem6QuickDraftLoaded?: boolean;
  AISystem6QuickDraft?: any;
  AISystem6QuickDraftRuntime?: any;
  AISystem6QuickDraftIntake?: any;
  AISystem6QuickDraftEditor?: any;
  AISystem6QuickDraftComposition?: any;
  AISystem6QuickDraftAI?: any;
  AISystem6QuickDraftListen?: any;
  AISystem6QuickDraftHandoff?: any;
  AISystem6ModelUserErrors?: any;
  AISystem6WebPlatform?: any;
  AISystem6Capabilities?: any;
  AISystem6Runtime?: any;
  AISystem6ExplanationLens?: {
    blankExplanationLens?: (options?: any) => any;
    normalizeExplanationLens?: (lens?: any) => any;
  };
  // The translation tables, by language. Read to tell a title the product
  // wrote from one the writer chose — see isDerivedQuickDraftTitle.
  AISystem6Data?: { translations?: Record<string, Record<string, any>> };
  AISystem6PromptFilesRuntime?: {
    resolvePromptFile?: (id: string, args?: any, language?: string) => { body?: string } | undefined;
  };
}

// The quick-draft ELI5 UI toggles `hidden` on elements returned by
// querySelector, which is typed as Element (the DOM lib only declares the
// property on HTMLElement).
interface Element {
  hidden: boolean;
}
