/**
 * Ambient declarations for the shared classic-script globals that
 * state-stores.js reads. The bundle is concatenated classic scripts; these
 * names come from other modules and are intentionally global.
 */
declare const projects: any[];
declare const chatFiles: any[];
declare const chatFolders: any[];
declare const scraps: any[];
declare const projectCdItems: any[];
declare const ragChunks: any[];
declare const lastContextBudget: any;
declare const lastRetrievedContextItems: any[];
declare const questionSheetBodyInput: HTMLTextAreaElement | null;
declare const teachTextBodyInput: HTMLTextAreaElement | null;
declare const teachTextWorkflowState: string;
declare const runtimeEnvironment: string;
declare const workspaceProfile: string;
declare function getActiveProject(): any;
declare function currentOutlineMarkdown(project: any): string;
declare function saveDeskState(): void;
declare function renderPipeline(): void;
declare function scheduleRenderTasks(kind: string): void;
declare function updateMenuState(): void;

interface Window {
  lastTaskRunManifest?: any;
  lastContextManifest?: any;
}
