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
declare function escapeHtml(text: string): string;
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

interface Window {
  AISystem6ProtectedRanges?: any;
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
  AISystem6QuickDraftHandoff?: any;
  AISystem6ModelUserErrors?: any;
  AISystem6WebPlatform?: any;
}
