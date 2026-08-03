import { app, BrowserWindow, ipcMain, screen, clipboard, systemPreferences, globalShortcut, shell } from 'electron';
import path from 'path';
import https from 'https';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import { AudioPipeline, AVAILABLE_MODELS } from '../../backend/sidecar/pipeline.ts';
import { downloadModelById, isModelDownloaded } from './downloadModel.js';
import { getBackendPath, DEFAULT_MODEL_ID } from './paths.js';
import { injectTextSystemWide } from './textInjector.js';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let pipeline: AudioPipeline | null = null;

let isFnPressed = false;
let isSpacePressed = false;
let isLongSession = false;
let isRecordingActive = false;
let lastTranscribedText = '';
let isShiftPressed = false;
let isShiftCPasteEnabled = true;
let lastClipboardText = '';
let clipboardHistory: { id: string; text: string; timestamp: string }[] = [];

function startClipboardPolling() {
  setInterval(() => {
    try {
      const text = clipboard.readText();
      if (text && text.trim() && text !== lastClipboardText) {
        lastClipboardText = text;
        const newItem = {
          id: String(Date.now()),
          text: text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        clipboardHistory = [newItem, ...clipboardHistory.slice(0, 49)];
        sendToWindows('clipboard_history_updated', clipboardHistory);
      }
    } catch (e) {
      console.error('Clipboard poll error:', e);
    }
  }, 1000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 880,
    minHeight: 620,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0A0C10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 200,
    height: 52,
    x: Math.round((width - 200) / 2),
    y: height - 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Always show on all workspaces/desktops on macOS
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, 'floating');

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    overlayWindow.loadURL(`${devUrl}?overlay=1`);
  } else {
    const htmlPath = path.join(app.getAppPath(), 'dist', 'index.html');
    overlayWindow.loadFile(htmlPath, { query: { overlay: '1' } });
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function setupGlobalHooks() {
  try {
    globalShortcut.register('CommandOrControl+Option+Space', () => {
      if (isRecordingActive) {
        stopRecordingAndInject();
      } else {
        startRecordingSession(true);
      }
    });
  } catch (e) {}

  if (process.platform === 'darwin') {
    try {
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);
      if (!isTrusted) {
        console.log('\n================================================================');
        console.log('NOTE: macOS Accessibility permission is required for global Fn key monitoring.');
        console.log('Please enable Electron in: System Settings -> Privacy & Security -> Accessibility');
        console.log('Backup shortcut active: Press Cmd + Option + Space to toggle dictation!');
        console.log('================================================================\n');
      }
    } catch (e) {}
  }

  try {
    uIOhook.on('keydown', (e) => {
      const isFn = e.keycode === 63 || e.keycode === 59 || (e as any).rawcode === 63;
      const isSpace = e.keycode === UiohookKey.Space;
      const isShift = e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight || (e as any).rawcode === 56 || (e as any).rawcode === 60;

      if (isShift) {
        isShiftPressed = true;
      }

      if (isFn) {
        if (!isFnPressed) {
          isFnPressed = true;
          if (isSpacePressed || isLongSession) {
            if (isLongSession) {
              stopRecordingAndInject();
            }
          } else {
            startRecordingSession(false);
          }
        }
      }

      if (isSpace) {
        isSpacePressed = true;
        if (isFnPressed && !isLongSession) {
          isLongSession = true;
          startRecordingSession(true);
        }
      }

      const isC = e.keycode === UiohookKey.C;
      if (isC && isShiftPressed && isShiftCPasteEnabled) {
        const textToPaste = lastTranscribedText || clipboard.readText();
        if (textToPaste) {
          injectTextSystemWide(textToPaste);
        }
      }
    });

    uIOhook.on('keyup', (e) => {
      const isFn = e.keycode === 63 || e.keycode === 59 || (e as any).rawcode === 63;
      const isSpace = e.keycode === UiohookKey.Space;
      const isShift = e.keycode === UiohookKey.Shift || e.keycode === UiohookKey.ShiftRight || (e as any).rawcode === 56 || (e as any).rawcode === 60;

      if (isShift) {
        isShiftPressed = false;
      }

      if (isFn) {
        isFnPressed = false;
        if (!isLongSession && isRecordingActive) {
          stopRecordingAndInject();
        }
      }

      if (isSpace) {
        isSpacePressed = false;
      }
    });

    uIOhook.start();
  } catch (err: any) {
    console.warn('uIOhook start handled notice:', err?.message || err);
  }
}

async function startRecordingSession(longSession: boolean = false) {
  if (isRecordingActive) return;
  isRecordingActive = true;

  if (pipeline) {
    pipeline.startRecording();
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
  }

  sendToWindows('recording_state_changed', { isRecording: true, isLongSession: longSession });
}

async function stopRecordingAndInject() {
  if (!isRecordingActive) return;
  isRecordingActive = false;
  isLongSession = false;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }

  let text = '';
  let emotionResult: any = { label: 'Neutral', confidence: 0.9 };

  if (pipeline) {
    const res = await pipeline.stopRecording();
    text = res.text;
    emotionResult = res.emotion;
  }

  lastTranscribedText = text;
  const injection = await injectTextSystemWide(text);

  sendToWindows('dictation_result', {
    text,
    emotion: emotionResult,
    cursorFound: injection.cursorFound,
    copied: injection.copied,
    inserted: injection.inserted,
  });

  sendToWindows('recording_state_changed', { isRecording: false, isLongSession: false });
}

function sendToWindows(channel: string, payload: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, payload);
  }
}

app.whenReady().then(async () => {
  createMainWindow();
  createOverlayWindow();
  startClipboardPolling();

  const backendPath = getBackendPath();
  pipeline = new AudioPipeline(backendPath);

  pipeline.on('audio_level', (level: number) => {
    sendToWindows('audio_level', level);
  });

  pipeline.on('live_emotion', (emotion: any) => {
    sendToWindows('live_emotion', emotion);
  });

  pipeline.on('ready', () => {
    sendToWindows('pipeline_ready', { models: pipeline?.refreshModelStatuses(), activeModel: pipeline?.getActiveModelId() });
  });

  await pipeline.initialize();

  // First launch: auto-download the default Whisper model (base.en) if missing
  if (!isModelDownloaded(DEFAULT_MODEL_ID)) {
    sendToWindows('setup_started', { modelId: DEFAULT_MODEL_ID });
    downloadModelById(DEFAULT_MODEL_ID, (progress) => {
      sendToWindows('download_progress', progress);
    }).then((result) => {
      if (pipeline) {
        pipeline.refreshModelStatuses();
        sendToWindows('pipeline_ready', {
          models: pipeline.refreshModelStatuses(),
          activeModel: pipeline.getActiveModelId(),
        });
      }
      sendToWindows('setup_complete', { modelId: DEFAULT_MODEL_ID, success: result.success });
    });
  }

  setupGlobalHooks();
  
  // Query updates on boot
  checkForUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createOverlayWindow();
    }
  });
});

function checkForUpdates() {
  const url = 'https://wisper.deepanshu.live/api/version';
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const info = JSON.parse(data);
        const currentVersion = app.getVersion();
        if (isNewerVersion(info.version, currentVersion)) {
          // Wait 5 seconds after startup so React frontend has loaded listeners
          setTimeout(() => {
            sendToWindows('update_available', info);
          }, 5000);
        }
      } catch (e) {}
    });
  }).on('error', () => {});
}

function isNewerVersion(latest: string, current: string): boolean {
  try {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    const [lMajor, lMinor, lPatch] = parse(latest);
    const [cMajor, cMinor, cPatch] = parse(current);
    
    if (lMajor > cMajor) return true;
    if (lMajor === cMajor && lMinor > cMinor) return true;
    if (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch) return true;
  } catch (e) {}
  return false;
}


app.on('window-all-closed', () => {
  try {
    uIOhook.stop();
  } catch (e) {}
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('get_models', () => {
  return pipeline ? pipeline.refreshModelStatuses() : AVAILABLE_MODELS;
});

ipcMain.handle('select_model', (_event, modelId: string) => {
  if (pipeline) {
    const ok = pipeline.setModel(modelId);
    if (ok) {
      sendToWindows('model_changed', modelId);
      return { success: true, activeModel: modelId };
    }
  }
  return { success: false };
});

ipcMain.handle('download_model', async (_event, modelId: string) => {
  const result = await downloadModelById(modelId, (progress) => {
    sendToWindows('download_progress', progress);
  });

  if (result.success && pipeline) {
    pipeline.refreshModelStatuses();
    sendToWindows('pipeline_ready', {
      models: pipeline.refreshModelStatuses(),
      activeModel: pipeline.getActiveModelId(),
    });
  }

  return result;
});

ipcMain.handle('start_dictation', (_event, longSession?: boolean) => {
  startRecordingSession(!!longSession);
  return { success: true };
});

ipcMain.handle('stop_dictation', () => {
  stopRecordingAndInject();
  return { success: true };
});

ipcMain.handle('copy_last_text', () => {
  if (lastTranscribedText) {
    clipboard.writeText(lastTranscribedText);
    return { success: true, text: lastTranscribedText };
  }
  return { success: false };
});

ipcMain.handle('get_clipboard_history', () => {
  return clipboardHistory;
});

ipcMain.handle('clear_clipboard_history', () => {
  clipboardHistory = [];
  lastClipboardText = '';
  sendToWindows('clipboard_history_updated', []);
});

ipcMain.handle('paste_clipboard_item', async (_event, text: string) => {
  if (text) {
    const res = await injectTextSystemWide(text);
    return { success: res.success };
  }
  return { success: false };
});

ipcMain.handle('set_shift_c_paste_enabled', (_event, enabled: boolean) => {
  isShiftCPasteEnabled = enabled;
});

ipcMain.handle('get_shift_c_paste_enabled', () => {
  return isShiftCPasteEnabled;
});

ipcMain.handle('is_setup_needed', () => {
  return !isModelDownloaded(DEFAULT_MODEL_ID);
});

ipcMain.handle('check_accessibility', () => {
  if (process.platform !== 'darwin') return true;
  try {
    return systemPreferences.isTrustedAccessibilityClient(false);
  } catch (e) {
    return true;
  }
});

ipcMain.handle('request_accessibility', () => {
  if (process.platform !== 'darwin') return true;
  try {
    return systemPreferences.isTrustedAccessibilityClient(true);
  } catch (e) {
    return true;
  }
});

ipcMain.handle('open_external_link', (_event, url: string) => {
  if (url) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('retry_setup', () => {
  if (!isModelDownloaded(DEFAULT_MODEL_ID)) {
    sendToWindows('setup_started', { modelId: DEFAULT_MODEL_ID });
    downloadModelById(DEFAULT_MODEL_ID, (progress) => {
      sendToWindows('download_progress', progress);
    }).then((result) => {
      if (pipeline) {
        pipeline.refreshModelStatuses();
        sendToWindows('pipeline_ready', {
          models: pipeline.refreshModelStatuses(),
          activeModel: pipeline.getActiveModelId(),
        });
      }
      sendToWindows('setup_complete', { modelId: DEFAULT_MODEL_ID, success: result.success });
    });
  }
  return { triggered: true };
});
