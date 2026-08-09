/**
 * Ambient declarations for the shared classic-script globals that
 * state-stores.js reads. The bundle is concatenated classic scripts; these
 * names come from other modules and are intentionally global.
 */
declare const projects: any[];
declare const chatFiles: any[];
declare const chatFolders: any[];
declare const scraps: any[];
declare const projectReferences: any[];
declare const projectCdItems: any[];
declare const trashItems: any[];
declare const ragChunks: any[];
declare const lastContextBudget: any;
declare const lastRetrievedContextItems: any[];
declare const activeProjectId: string;
declare const activeTextFileId: string;
declare const questionSheetBodyInput: HTMLTextAreaElement | null;
declare const teachTextBodyInput: HTMLTextAreaElement | null;
declare let selectedChatFileId: string;
declare const teachTextWorkflowState: string;
declare const keyvalStoreName: string;
declare const modelCatalog: any[];
declare let runtimeEnvironment: string;
declare const workspaceProfile: string;
declare const modalScrim: HTMLElement;
declare function getActiveProject(): any;
declare function currentOutlineMarkdown(project: any): string;
declare function saveDeskState(): Promise<boolean>;
declare function openAppDb(): Promise<any>;
declare function idbRequest(request: any): Promise<any>;
declare function getProjectFiles(): any[];
declare function getLocalModelRequestName(): string;
declare function isManualLocalModelMode(): boolean;
declare function setSelectOptions(select: any, catalog: any[], previous: string): void;
declare function setStatus(message: string): void;
declare function pushSystemNotification(message: string, options?: any): string;
declare function renderDocuments(): void;
declare function renderProjectDisks(): void;
declare function renderScraps(): void;
declare function renderTrash(): void;
declare function renderProjectCd(): void;
declare function markTeachTextModified(): void;
declare function refreshTeachTextDocumentState(): void;
declare const teachTextStatusEl: HTMLElement | null;
declare function setTeachTextStatus(key: string): void;
declare function openWindow(name: string): void;
declare function t(key: string, ...args: any[]): string;
declare function renderPipeline(): void;
declare function scheduleRenderTasks(kind: string): void;
declare function updateMenuState(): void;
declare function createDocumentRevision(options: any): Promise<any>;
declare const crypto: Crypto;
declare const structuredClone: typeof globalThis.structuredClone;
declare const localStorage: Storage;

interface Window {
  lastTaskRunManifest?: any;
  lastContextManifest?: any;
  AISystem6StorageTransactions?: any;
  AISystem6DerivedIndexQueue?: any;
  AISystem6DesktopMaintenance?: any;
  AISystem6DesktopMaintenanceLoaded?: boolean;
  AISystem6ProjectDiskBackup?: any;
  AISystem6ModelRoles?: any;
  AISystem6ModelTaskRuntime?: any;
  AISystem6DocumentRevisions?: any;
  AISystem6StateStores?: any;
  AISystem6ApplicationRegistry?: any;
  AISystem6RunReceipts?: any;
  AISystem6AssistantActivity?: any;
}
