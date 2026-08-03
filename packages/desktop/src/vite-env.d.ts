/// <reference types="vite/client" />

export interface ElectronAPI {
    getModels: () => Promise<any[]>;
    selectModel: (modelId: string) => Promise<{ success: boolean; activeModel?: string }>;
    downloadModel: (modelId: string) => Promise<{ success: boolean; error?: string; already?: boolean }>;
    startDictation: (longSession?: boolean) => Promise<{ success: boolean }>;
    stopDictation: (overrideText?: string) => Promise<{ success: boolean }>;
    copyLastText: () => Promise<{ success: boolean; text?: string }>;
    isSetupNeeded: () => Promise<boolean>;
    retrySetup: () => Promise<{ triggered: boolean }>;
    checkAccessibility: () => Promise<boolean>;
    requestAccessibility: () => Promise<boolean>;
    checkMicrophone: () => Promise<boolean>;
    requestMicrophone: () => Promise<boolean>;
    onAudioLevel: (callback: (level: number) => void) => () => void;
    onLiveEmotion: (callback: (emotion: { label: string; confidence: number; scores: Record<string, number> }) => void) => () => void;
    onPartialTranscript: (callback: (data: { committed: string; delta: string; pending: string }) => void) => () => void;
    onUtteranceContext: (callback: (data: { exe: string; kind: string; isTerminal: boolean }) => void) => () => void;
    onRecordingStateChanged: (callback: (data: { isRecording: boolean; isLongSession: boolean; isProcessing?: boolean }) => void) => () => void;
    onDictationResult: (callback: (result: { text: string; emotion: any; cursorFound: boolean; copied: boolean; inserted: boolean }) => void) => () => void;
    onModelChanged: (callback: (modelId: string) => void) => () => void;
    onPipelineReady: (callback: (data: { models: any[]; activeModel: string }) => void) => () => void;
    onDownloadProgress: (callback: (data: { modelId: string; percent: number; done: boolean; error?: string }) => void) => () => void;
    onSetupStarted: (callback: (data: { modelId: string }) => void) => () => void;
    onSetupComplete: (callback: (data: { modelId: string; success: boolean }) => void) => () => void;
    getClipboardHistory: () => Promise<any[]>;
    clearClipboardHistory: () => Promise<void>;
    pasteClipboardItem: (text: string) => Promise<{ success: boolean }>;
    setShiftCPasteEnabled: (enabled: boolean) => Promise<void>;
    getShiftCPasteEnabled: () => Promise<boolean>;
    onClipboardHistoryUpdated: (callback: (history: any[]) => void) => () => void;
    openExternalLink: (url: string) => Promise<boolean>;
    onUpdateAvailable: (callback: (data: { version: string; downloadUrl: string; notes: string }) => void) => () => void;
    onAccessibilityStatus: (callback: (data: { granted: boolean }) => void) => () => void;
    onPipelineError: (callback: (data: { message: string }) => void) => () => void;
    onMicrophoneStatus: (callback: (data: { granted: boolean }) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
