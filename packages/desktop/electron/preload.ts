import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    getModels: () => ipcRenderer.invoke('get_models'),
    selectModel: (modelId: string) => ipcRenderer.invoke('select_model', modelId),
    downloadModel: (modelId: string) => ipcRenderer.invoke('download_model', modelId),
    deleteModel: (modelId: string) => ipcRenderer.invoke('delete_model', modelId),
    getEmotionModelStatus: () => ipcRenderer.invoke('get_emotion_model_status'),
    downloadEmotionModel: () => ipcRenderer.invoke('download_emotion_model'),
    deleteEmotionModel: () => ipcRenderer.invoke('delete_emotion_model'),
    onEmotionModelStatus: (callback: (d: any) => void) => {
        const handler = (_e: any, d: any) => callback(d);
        ipcRenderer.on('emotion_model_status', handler);
        return () => ipcRenderer.removeListener('emotion_model_status', handler);
    },
    startDictation: (longSession?: boolean) => ipcRenderer.invoke('start_dictation', longSession),
    stopDictation: (overrideText?: string) => ipcRenderer.invoke('stop_dictation', overrideText),
    copyLastText: () => ipcRenderer.invoke('copy_last_text'),
    isSetupNeeded: () => ipcRenderer.invoke('is_setup_needed'),
    getSetupStatus: () => ipcRenderer.invoke('get_setup_status'),
    retrySetup: () => ipcRenderer.invoke('retry_setup'),
    checkAccessibility: () => ipcRenderer.invoke('check_accessibility'),
    requestAccessibility: () => ipcRenderer.invoke('request_accessibility'),
    checkFnKeySetting: () => ipcRenderer.invoke('check_fn_key_setting'),
    getDictionary: () => ipcRenderer.invoke('get_dictionary'),
    setDictionary: (entries: { word: string; heardAs?: string }[]) => ipcRenderer.invoke('set_dictionary', entries),
    checkMicrophone: () => ipcRenderer.invoke('check_microphone'),
    requestMicrophone: () => ipcRenderer.invoke('request_microphone'),
    openExternalLink: (url: string) => ipcRenderer.invoke('open_external_link', url),

    onAudioLevel: (callback: (level: number) => void) => {
        const handler = (_event: any, level: number) => callback(level);
        ipcRenderer.on('audio_level', handler);
        return () => ipcRenderer.removeListener('audio_level', handler);
    },

    onLiveEmotion: (callback: (emotion: { label: string; confidence: number; scores: Record<string, number> }) => void) => {
        const handler = (_event: any, emotion: any) => callback(emotion);
        ipcRenderer.on('live_emotion', handler);
        return () => ipcRenderer.removeListener('live_emotion', handler);
    },

    onPartialTranscript: (callback: (data: { committed: string; delta: string; pending: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('partial_transcript', handler);
        return () => ipcRenderer.removeListener('partial_transcript', handler);
    },

    onUtteranceContext: (callback: (data: { exe: string; kind: string; isTerminal: boolean }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('utterance_context', handler);
        return () => ipcRenderer.removeListener('utterance_context', handler);
    },

    onRecordingStateChanged: (callback: (data: { isRecording: boolean; isLongSession: boolean; isProcessing?: boolean }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('recording_state_changed', handler);
        return () => ipcRenderer.removeListener('recording_state_changed', handler);
    },

    onDictationResult: (callback: (result: { text: string; emotion: any; cursorFound: boolean; copied: boolean; inserted: boolean }) => void) => {
        const handler = (_event: any, result: any) => callback(result);
        ipcRenderer.on('dictation_result', handler);
        return () => ipcRenderer.removeListener('dictation_result', handler);
    },

    onModelChanged: (callback: (modelId: string) => void) => {
        const handler = (_event: any, modelId: string) => callback(modelId);
        ipcRenderer.on('model_changed', handler);
        return () => ipcRenderer.removeListener('model_changed', handler);
    },

    onPipelineReady: (callback: (data: { models: any[]; activeModel: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('pipeline_ready', handler);
        return () => ipcRenderer.removeListener('pipeline_ready', handler);
    },

    onDownloadProgress: (callback: (data: { modelId: string; percent: number; done: boolean; error?: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('download_progress', handler);
        return () => ipcRenderer.removeListener('download_progress', handler);
    },

    onSetupStarted: (callback: (data: { modelId: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('setup_started', handler);
        return () => ipcRenderer.removeListener('setup_started', handler);
    },

    onSetupComplete: (callback: (data: { modelId: string; success: boolean }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('setup_complete', handler);
        return () => ipcRenderer.removeListener('setup_complete', handler);
    },

    getClipboardHistory: () => ipcRenderer.invoke('get_clipboard_history'),
    clearClipboardHistory: () => ipcRenderer.invoke('clear_clipboard_history'),
    pasteClipboardItem: (text: string) => ipcRenderer.invoke('paste_clipboard_item', text),
    setShiftCPasteEnabled: (enabled: boolean) => ipcRenderer.invoke('set_shift_c_paste_enabled', enabled),
    getShiftCPasteEnabled: () => ipcRenderer.invoke('get_shift_c_paste_enabled'),

    onClipboardHistoryUpdated: (callback: (history: any[]) => void) => {
        const handler = (_event: any, history: any) => callback(history);
        ipcRenderer.on('clipboard_history_updated', handler);
        return () => ipcRenderer.removeListener('clipboard_history_updated', handler);
    },

    onUpdateAvailable: (callback: (data: { version: string; downloadUrl: string; notes: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('update_available', handler);
        return () => ipcRenderer.removeListener('update_available', handler);
    },

    onAccessibilityStatus: (callback: (data: { granted: boolean }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('accessibility_status', handler);
        return () => ipcRenderer.removeListener('accessibility_status', handler);
    },

    onPipelineError: (callback: (data: { message: string }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('pipeline_error', handler);
        return () => ipcRenderer.removeListener('pipeline_error', handler);
    },

    onMicrophoneStatus: (callback: (data: { granted: boolean }) => void) => {
        const handler = (_event: any, data: any) => callback(data);
        ipcRenderer.on('microphone_status', handler);
        return () => ipcRenderer.removeListener('microphone_status', handler);
    },
});
