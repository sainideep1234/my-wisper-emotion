import { app, BrowserWindow, ipcMain, screen, clipboard, systemPreferences, globalShortcut, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import Module from 'module';
import https from 'https';
import { spawn, execFile, type ChildProcess } from 'child_process';
import fs from 'fs';


// ─── Native Module Path Injection (MUST run before any native require) ────────
// extraResources places uiohook-napi/naudiodon at Resources/node_modules/.
// We prepend that path to Node's module resolution so require() finds them.
const nativePath = path.join(process.resourcesPath, 'node_modules');
const Module_ = Module as any;
const existingPaths: string[] = Module_._nodeModulePaths?.(__dirname) ?? [];
if (!existingPaths.includes(nativePath)) {
    // Inject into require.main.paths so resolution walks here first
    if (require.main?.paths) require.main.paths.unshift(nativePath);
    // Also ensure __dirname-relative paths include resourcesPath
    const _origNodeModPaths = Module_._nodeModulePaths.bind(Module_);
    Module_._nodeModulePaths = (from: string) => {
        const paths: string[] = _origNodeModPaths(from);
        if (!paths.includes(nativePath)) paths.unshift(nativePath);
        return paths;
    };
}
// ─────────────────────────────────────────────────────────────────────────────

// Load uiohook-napi AFTER path injection (require is preserved by esbuild for --external modules)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { uIOhook, UiohookKey } = require('uiohook-napi') as typeof import('uiohook-napi');

import { AudioPipeline, AVAILABLE_MODELS } from '../../engine/pipeline.ts';
import { downloadModelById } from './download-model.js';
import { getBackendPath, DEFAULT_MODEL_ID, getModelsDirPath } from './paths.js';
import { injectTextSystemWide } from './text-injector.js';

// Prevent Electron main process crash on detached stdout/stderr pipes (EPIPE)
process.stdout?.on?.('error', (err: any) => {
    if (err?.code === 'EPIPE' || err?.syscall === 'write') return;
});
process.stderr?.on?.('error', (err: any) => {
    if (err?.code === 'EPIPE' || err?.syscall === 'write') return;
});
process.on('uncaughtException', (err: any) => {
    if (err?.code === 'EPIPE' || err?.syscall === 'write') return;
    console.error('Uncaught Exception:', err);
});

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let pipeline: AudioPipeline | null = null;
let fnPoller: ChildProcess | null = null;
let tray: Tray | null = null;


let isFnPressed = false;
let isSpacePressed = false;
let isLongSession = false;
let isRecordingActive = false;
let lastTranscribedText = '';
let isShiftPressed = false;
let isShiftCPasteEnabled = true;
let lastClipboardText = '';
let clipboardHistory: { id: string; text: string; timestamp: string; source?: 'dictation' | 'clipboard' }[] = [];
/** Live-streamed text already pasted this utterance (LocalAgreement commits). */
let liveInjected = '';
let currentTargetHints: { isTerminal?: boolean; isElevated?: boolean; exe?: string; kind?: string } = {};

/** Put text on the system clipboard and prepend it to in-app clipboard history. */
function rememberTranscript(text: string, source: 'dictation' | 'clipboard' = 'dictation') {
    const trimmed = text?.trim();
    if (!trimmed) return;

    if (source === 'dictation') {
        clipboard.writeText(trimmed);
        lastTranscribedText = trimmed;
    }
    lastClipboardText = trimmed;

    // Avoid duplicate consecutive entries
    if (clipboardHistory[0]?.text === trimmed) {
        sendToWindows('clipboard_history_updated', clipboardHistory);
        return;
    }

    const newItem = {
        id: String(Date.now()),
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source,
    };
    clipboardHistory = [newItem, ...clipboardHistory.slice(0, 49)];
    sendToWindows('clipboard_history_updated', clipboardHistory);
}

function startClipboardPolling() {
    // No-op
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
        const htmlPath = path.join(app.getAppPath(), 'packages', 'desktop', 'dist', 'index.html');
        mainWindow.loadFile(htmlPath);
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const OVERLAY_WIDTH = 360;
const OVERLAY_HEIGHT = 72;

/**
 * Centre the overlay near the bottom of whichever screen the user is on.
 *
 * Two things made this drift. The old maths used `workAreaSize`, which is only a
 * width/height — it drops `workArea.x/y`, so a Dock on the left or right (or any
 * non-primary display) put the pill off-centre. And the pill's root element is
 * `-webkit-app-region: drag`, so a single accidental drag moved the window and
 * nothing ever put it back: position was set once at creation and `showInactive()`
 * never touched it again. Re-centring on every show makes it self-correcting.
 */
function positionOverlay(): void {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
        // Follow the cursor's display so the pill shows up on the screen being used.
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const wa = display.workArea;
        overlayWindow.setBounds({
            x: Math.round(wa.x + (wa.width - OVERLAY_WIDTH) / 2),
            y: Math.round(wa.y + wa.height - 120),
            width: OVERLAY_WIDTH,
            height: OVERLAY_HEIGHT,
        });
    } catch { /* a display can disappear mid-call; leave it where it is */ }
}

function createOverlayWindow() {
    const initial = screen.getPrimaryDisplay().workArea;
    const overlayWidth = OVERLAY_WIDTH;
    const overlayHeight = OVERLAY_HEIGHT;

    overlayWindow = new BrowserWindow({
        width: overlayWidth,
        height: overlayHeight,
        x: Math.round(initial.x + (initial.width - overlayWidth) / 2),
        y: Math.round(initial.y + initial.height - 120),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        focusable: false,
        hasShadow: false,
        show: false,
        backgroundColor: '#00000000',
        ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });

    // Always show on all workspaces/desktops on macOS
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setAlwaysOnTop(true, 'floating');

    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        overlayWindow.loadURL(`${devUrl}?overlay=1`);
    } else {
        const htmlPath = path.join(app.getAppPath(), 'packages', 'desktop', 'dist', 'index.html');
        overlayWindow.loadFile(htmlPath, { query: { overlay: '1' } });
    }

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });

    // Plugging in a monitor, changing resolution or moving the Dock all shift the
    // work area out from under the pill.
    screen.on('display-metrics-changed', positionOverlay);
    screen.on('display-added', positionOverlay);
    screen.on('display-removed', positionOverlay);
}

function createTray() {
    if (tray) return;
    
    // A simple 16x16 transparent icon with a small circle, fallback for Windows/Linux
    const fallbackIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAcElEQVQ4T2NkYGD4z8DAwMgwEIBxQABMDKsgbAA2zYQ0k20AMY3EGkCWAUjuxWYA2QYgu5tUA8g2AL2byDaAbAAYzYTcAKoBQD8TwgD0tBM14xENAEbbF2wA0WSEdCOI9zI0QAADf8wz9o9mZqMAAAAASUVORK5CYII=';
    const icon = nativeImage.createFromDataURL(fallbackIcon);
    
    tray = new Tray(icon);
    if (process.platform === 'darwin') {
        tray.setTitle('W'); // Native macOS text tray icon
    }
    tray.setToolTip('Wisper Emotion');
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Settings',
            click: () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.show();
                    mainWindow.focus();
                } else {
                    createMainWindow();
                }
            }
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);
    
    tray.setContextMenu(contextMenu);
}

function getFnPollerPath(): string {
    const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;
    if (isDev) {
        return path.resolve(process.cwd(), 'bin', 'fn-poll');
    }
    return path.join(process.resourcesPath, 'bin', 'fn-poll');
}

/**
 * Space arrives either as uiohook's normalized keycode (57) or, when the event
 * carries the platform code, as the macOS virtual keycode kVK_Space = 49.
 *
 * The 49 check MUST be against rawcode only: in uiohook's normalized keyspace
 * 49 is the letter "N", so matching it on keycode would make pressing N start
 * hands-free mode.
 */
function isSpaceKey(keycode: number, rawcode: number): boolean {
    return keycode === UiohookKey.Space || rawcode === 49;
}

/**
 * Hotkey state machine:
 *   Hold Fn          → push-to-talk (release Fn to stop)
 *   Fn + Space       → hands-free lock (tap Fn again to stop)
 *   Space while Fn   → promote current hold to hands-free
 */
function onFnDown() {
    if (isFnPressed) return;
    isFnPressed = true;

    // Hands-free: second Fn tap stops
    if (isLongSession && isRecordingActive) {
        console.log('[hotkey] Fn tap → stop hands-free');
        void stopRecordingAndInject();
        return;
    }

    // Fn held while Space already down → start hands-free directly
    if (isSpacePressed) {
        console.log('[hotkey] Fn+Space → hands-free');
        isLongSession = true;
        void startRecordingSession(true);
        return;
    }

    // Plain Fn hold → push-to-talk
    console.log('[hotkey] Fn hold → push-to-talk');
    void startRecordingSession(false);
}

function onFnUp() {
    if (!isFnPressed) return;
    isFnPressed = false;

    // Push-to-talk: release stops. Hands-free keeps going.
    if (!isLongSession && isRecordingActive) {
        console.log('[hotkey] Fn release → stop push-to-talk');
        void stopRecordingAndInject();
    }
}

function onSpaceDown() {
    if (isSpacePressed) return;
    isSpacePressed = true;
    console.log(`[hotkey] Space down (fn=${isFnPressed} recording=${isRecordingActive} long=${isLongSession})`);

    // Promote active Fn hold into hands-free
    if (isFnPressed && isRecordingActive && !isLongSession) {
        isLongSession = true;
        console.log('[hotkey] Space during Fn → hands-free lock');
        sendToWindows('recording_state_changed', {
            isRecording: true,
            isLongSession: true,
            context: currentTargetHints,
        });
        return;
    }

    // Space then Fn is handled in onFnDown via isSpacePressed
}

function onSpaceUp() {
    isSpacePressed = false;
}

function setupGlobalHooks() {
    // Backup shortcut (works without Accessibility)
    try {
        globalShortcut.register('CommandOrControl+Option+Space', () => {
            if (isRecordingActive) {
                void stopRecordingAndInject();
            } else {
                isLongSession = true;
                void startRecordingSession(true);
            }
        });
        console.log('✓ Backup shortcut registered: Cmd+Option+Space');
    } catch {
        // ignore
    }

    if (process.platform === 'darwin') {
        try {
            const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);
            if (!isTrusted) {
                console.log('\n================================================================');
                console.log('NOTE: Accessibility required for Fn key + auto-paste.');
                console.log('Enable Electron in: System Settings → Privacy & Security → Accessibility');
                console.log('Also set: Keyboard → "Press Fn key to" → Do Nothing');
                console.log('Backup: Cmd + Option + Space');
                console.log('================================================================\n');
                sendToWindows('accessibility_status', { granted: false });
            } else {
                console.log('✓ macOS Accessibility permission granted');
                sendToWindows('accessibility_status', { granted: true });
            }
        } catch {
            // ignore
        }

        // Reliable Fn detection: CGEventSourceKeyState poller (uIOhook often misses Fn on macOS)
        startFnPoller();
    }

    try {
        console.log('Starting uIOhook for Space / secondary Fn monitoring...');
        uIOhook.on('keydown', (e) => {
            const kc = e.keycode;
            const raw = (e as { rawcode?: number }).rawcode ?? -1;

            if (process.env.WISPER_KEY_DEBUG === '1') {
                console.log(`[keydebug] keycode=${kc} rawcode=${raw}`);
            }

            // Secondary Fn signals (when the OS surfaces them to the event tap)
            const fnLike =
                kc === 63 || kc === 179 || kc === 464 ||
                raw === 63 || raw === 179 || raw === 0x3f;
            if (fnLike) onFnDown();

            // uiohook's normalized code for Space is 57, but on macOS the event
            // often carries the native virtual keycode (kVK_Space = 49) instead —
            // the same reason Shift below needs its 56/60 fallbacks. Without this,
            // Space was never seen and Fn+Space hands-free never engaged.
            if (isSpaceKey(kc, raw)) onSpaceDown();

            const isShift =
                kc === UiohookKey.Shift ||
                kc === UiohookKey.ShiftRight ||
                raw === 56 ||
                raw === 60;
            if (isShift) isShiftPressed = true;

            if (kc === UiohookKey.C && isShiftPressed && isShiftCPasteEnabled) {
                const textToPaste = lastTranscribedText || clipboard.readText();
                if (textToPaste) {
                    rememberTranscript(textToPaste, 'dictation');
                    void injectTextSystemWide(textToPaste);
                }
            }

            // Cmd/Ctrl+V is normal paste — last transcript is already on the clipboard.
            // Also allow Cmd+Shift+V to force-paste last dictation from history.
            const isV = kc === UiohookKey.V;
            const isMeta =
                kc === UiohookKey.Meta ||
                kc === UiohookKey.MetaRight ||
                (e as { metaKey?: boolean }).metaKey === true ||
                (e as { ctrlKey?: boolean }).ctrlKey === true;
            // Detect via event flags when available
            const mods = e as { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean };
            if (isV && mods.shiftKey && (mods.metaKey || mods.ctrlKey) && lastTranscribedText) {
                void injectTextSystemWide(lastTranscribedText);
            }
        });

        uIOhook.on('keyup', (e) => {
            const kc = e.keycode;
            const raw = (e as { rawcode?: number }).rawcode ?? -1;

            const fnLike =
                kc === 63 || kc === 179 || kc === 464 ||
                raw === 63 || raw === 179 || raw === 0x3f;
            if (fnLike) onFnUp();

            if (isSpaceKey(kc, raw)) onSpaceUp();

            const isShift =
                kc === UiohookKey.Shift ||
                kc === UiohookKey.ShiftRight ||
                raw === 56 ||
                raw === 60;
            if (isShift) isShiftPressed = false;
        });

        uIOhook.start();
        console.log('✓ uIOhook started successfully');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('uIOhook not available on this system:', msg);
        console.log('Fn poller + Cmd+Option+Space remain active');
    }
}

function startFnPoller() {
    if (fnPoller) return;
    const bin = getFnPollerPath();
    try {
        const proc = spawn(bin, [], { stdio: ['ignore', 'pipe', 'pipe'] });
        fnPoller = proc;
        let buf = '';
        proc.stdout?.on('data', (chunk: Buffer) => {
            buf += chunk.toString('utf8');
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                const t = line.trim();
                if (t === 'down') onFnDown();
                else if (t === 'up') onFnUp();
            }
        });
        proc.stdout?.on('error', (err: any) => {
            if (err?.code === 'EPIPE') return;
        });
        proc.stderr?.on('data', (chunk: Buffer) => {
            console.warn('[fn-poll]', chunk.toString('utf8').trim());
        });
        proc.stderr?.on('error', (err: any) => {
            if (err?.code === 'EPIPE') return;
        });

        proc.on('error', (err: Error) => {
            console.warn('fn-poll failed to start:', err.message, '— build with: bun run build:fn-poll');
            fnPoller = null;
        });
        proc.on('exit', (code: number | null) => {
            console.warn(`fn-poll exited (${code})`);
            fnPoller = null;
        });
        console.log('✓ Fn poller started:', bin);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('Could not start fn-poll:', msg);
    }
}


function stopFnPoller() {
    if (!fnPoller) return;
    try {
        fnPoller.kill('SIGTERM');
    } catch {
        // ignore
    }
    fnPoller = null;
}

async function startRecordingSession(longSession: boolean = false) {
    if (isRecordingActive) return;
    isRecordingActive = true;
    isLongSession = longSession;
    liveInjected = '';
    currentTargetHints = {};

    // Show pill without stealing focus from the app the user is typing in.
    // Re-centre first: the pill is draggable, so it may have been nudged since
    // the last time it appeared.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        positionOverlay();
        overlayWindow.showInactive();
    }

    sendToWindows('recording_state_changed', {
        isRecording: true,
        isLongSession: longSession,
        context: currentTargetHints,
    });

    if (pipeline) {
        await pipeline.startRecording();
        const ctx = pipeline.getContext();
        currentTargetHints = {
            isTerminal: ctx.isTerminal,
            isElevated: ctx.isElevated,
            exe: ctx.exe,
            kind: ctx.kind,
        };
        sendToWindows('utterance_context', ctx);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopRecordingAndInject(overrideText?: string) {
    if (!isRecordingActive) return;

    // Hide overlay first so the previously focused app regains the caret
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
    }

    if (process.platform === 'darwin') {
        if (!mainWindow || !mainWindow.isFocused()) {
            app.hide();
        }
    }

    sendToWindows('recording_state_changed', { isRecording: false, isLongSession: false, isProcessing: true });

    isRecordingActive = false;
    const wasLong = isLongSession;
    isLongSession = false;

    let text = '';
    let emotionResult: any = { label: 'Neutral', confidence: 0.9 };

    if (pipeline) {
        const res = await pipeline.stopRecording();
        text = res.text;
        emotionResult = res.emotion;
        currentTargetHints = {
            isTerminal: res.context.isTerminal,
            isElevated: res.context.isElevated,
            exe: res.context.exe,
            kind: res.context.kind,
        };
    }

    if (overrideText && overrideText.trim()) {
        text = overrideText.trim();
    }

    lastTranscribedText = text;
    liveInjected = '';

    if (text) {
        if (!app.isPackaged) {
            console.log(`\n--- Transcript (${wasLong ? 'hands-free' : 'push-to-talk'}) ---`);
            console.log(text);
            console.log('------------------\n');
        }
        // Always copy to clipboard + history so Cmd+V pastes the last transcript
        rememberTranscript(text, 'dictation');
    }

    // Let focus settle back on the target app, then paste once (no modal)
    await delay(60);
    const injection = text

        ? await injectTextSystemWide(text, currentTargetHints)
        : { success: false, inserted: false, copied: false, cursorFound: false };

    // Re-assert clipboard after paste helper (keeps last transcript for manual Cmd+V)
    if (text) {
        clipboard.writeText(text);
        lastClipboardText = text;
    }

    // Quiet UI update for history only — never pop a transcript modal
    sendToWindows('dictation_result', {
        text,
        emotion: emotionResult,
        cursorFound: injection.cursorFound,
        copied: injection.copied || !!text,
        inserted: injection.inserted,
        context: currentTargetHints,
        silent: true,
    });

    sendToWindows('recording_state_changed', { isRecording: false, isLongSession: false, isProcessing: false });
}

/** Live partials update the pill meter path only — never paste / never show text modal. */
async function onLivePartial(result: { committed: string; delta: string; pending: string }) {
    sendToWindows('partial_transcript', result);
}

function sendToWindows(channel: string, payload: any) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send(channel, payload);
    }
}

async function ensureMicrophoneAccess(): Promise<boolean> {
    if (process.platform !== 'darwin') return true;
    try {
        const status = systemPreferences.getMediaAccessStatus('microphone');
        if (status === 'granted') {
            sendToWindows('microphone_status', { granted: true });
            return true;
        }
        console.log('\n================================================================');
        console.log('Microphone permission required for voice dictation.');
        console.log('macOS will show a permission dialog — click Allow.');
        console.log('================================================================\n');
        const granted = await systemPreferences.askForMediaAccess('microphone');
        sendToWindows('microphone_status', { granted });
        if (!granted) {
            console.warn('Microphone permission denied. Enable in:');
            console.warn('  System Settings → Privacy & Security → Microphone → Electron');
        }
        return granted;
    } catch (e) {
        console.warn('Could not request microphone access:', e);
        return false;
    }
}

/**
 * Models already present on disk, largest-first so we prefer the better one.
 * Checked straight off the filesystem so it works before the pipeline exists.
 */
function listDownloadedModelIds(): string[] {
    const dir = getModelsDirPath();
    return AVAILABLE_MODELS
        .filter((m) => {
            try {
                return fs.statSync(path.join(dir, m.filename)).size > 10 * 1024 * 1024;
            } catch {
                return false;
            }
        })
        .map((m) => m.id);
}

let setupState: { phase: 'idle' | 'downloading' | 'done' | 'error'; percent: number; error?: string } = {
    phase: 'idle',
    percent: 0,
};

function startDefaultModelDownload(): void {
    if (setupState.phase === 'downloading') return;
    setupState = { phase: 'downloading', percent: 0 };
    sendToWindows('setup_started', { modelId: DEFAULT_MODEL_ID });

    void downloadModelById(DEFAULT_MODEL_ID, (progress) => {
        setupState = {
            phase: progress.error ? 'error' : progress.done ? 'done' : 'downloading',
            percent: progress.percent,
            error: progress.error,
        };
        sendToWindows('download_progress', progress);
    }).then((result) => {
        setupState = result.success
            ? { phase: 'done', percent: 100 }
            : { phase: 'error', percent: 0, error: result.error };
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

/**
 * Delete partial downloads left behind by a previous run.
 *
 * Every downloader here streams to `<name>.tmp` and renames on completion, so a
 * quit or crash mid-download strands the partial forever — nothing else ever
 * looks at it. One interrupted large-v3 fetch leaves 1.3 GB sitting in
 * Application Support that the user cannot see or remove from the UI. Any .tmp
 * present at startup is by definition abandoned: no download is in flight yet.
 */
function sweepStalePartialDownloads(): void {
    try {
        const dir = getModelsDirPath();
        if (!fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
            if (!name.endsWith('.tmp')) continue;
            const full = path.join(dir, name);
            try {
                const mb = Math.round(fs.statSync(full).size / (1024 * 1024));
                fs.unlinkSync(full);
                console.log(`reclaimed abandoned partial download: ${name} (${mb} MB)`);
            } catch { /* leave it rather than fail startup */ }
        }
    } catch { /* never block launch over cleanup */ }
}

app.whenReady().then(async () => {
    sweepStalePartialDownloads();
    createMainWindow();
    createOverlayWindow();
    createTray();
    startClipboardPolling();

    // Start the model download BEFORE anything that can block. ensureMicrophoneAccess()
    // waits on the macOS permission dialog, and pipeline.initialize() opens the mic —
    // gating the download behind either left first-run users stuck at "Preparing… 0%"
    // until they answered a prompt that may be hidden behind the window.
    if (listDownloadedModelIds().length === 0) {
        startDefaultModelDownload();
    } else {
        setupState = { phase: 'done', percent: 100 };
    }

    // Request mic permission before any recording (macOS blocks silent audio without this)
    await ensureMicrophoneAccess();

    // Register keyboard hooks IMMEDIATELY — don't wait for pipeline init
    setupGlobalHooks();

    const backendPath = getBackendPath();
    const modelsDir = getModelsDirPath();
    pipeline = new AudioPipeline(backendPath, { modelsPath: modelsDir });
    applyDictionary(loadDictionary());
    if (isEmotionModelInstalled()) pipeline.setEmotionModelPath(getEmotionModelPath());

    pipeline.on('audio_level', (level: number) => {
        sendToWindows('audio_level', level);
    });

    pipeline.on('live_emotion', (emotion: any) => {
        sendToWindows('live_emotion', emotion);
    });

    pipeline.on('partial', (result: { committed: string; delta: string; pending: string }) => {
        void onLivePartial(result);
    });

    pipeline.on('context', (ctx: { exe: string; kind: string; isTerminal: boolean }) => {
        sendToWindows('utterance_context', ctx);
    });

    pipeline.on('ready', () => {
        sendToWindows('pipeline_ready', { models: pipeline?.refreshModelStatuses(), activeModel: pipeline?.getActiveModelId() });
    });

    pipeline.on('error', (msg: string) => {
        console.error('Pipeline error:', msg);
        isRecordingActive = false;
        isLongSession = false;
        liveInjected = '';
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.hide();
        }
        sendToWindows('pipeline_error', { message: msg });
        sendToWindows('recording_state_changed', { isRecording: false, isLongSession: false, isProcessing: false });
    });

    try {
        await pipeline.initialize();
    } catch (e) {
        console.error('Pipeline initialization error:', e);
    }

    app.on('will-quit', () => {
        pipeline?.shutdown();
        stopFnPoller();
        try { uIOhook.stop(); } catch { /* */ }
        try { globalShortcut.unregisterAll(); } catch { /* */ }
    });

    // If base.en is missing but the user already has another model, use that one
    // instead of blocking them behind a 142 MB download they don't need.
    const available = listDownloadedModelIds();
    if (available.length > 0 && !available.includes(DEFAULT_MODEL_ID)) {
        if (pipeline?.setModel(available[0]!)) {
            console.log(`Using already-downloaded model: ${available[0]}`);
            sendToWindows('model_changed', available[0]);
        }
    }

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
            } catch (e) { }
        });
    }).on('error', () => { });
}

function isNewerVersion(latest: string, current: string): boolean {
    try {
        const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
        const [lMajor, lMinor, lPatch] = parse(latest);
        const [cMajor, cMinor, cPatch] = parse(current);

        if (lMajor > cMajor) return true;
        if (lMajor === cMajor && lMinor > cMinor) return true;
        if (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch) return true;
    } catch (e) { }
    return false;
}


app.on('window-all-closed', () => {
    stopFnPoller();
    try {
        uIOhook.stop();
    } catch { /* */ }
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
        pipeline.setModel(modelId); // Automatically use the newly downloaded model
        sendToWindows('model_changed', modelId);
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

ipcMain.handle('stop_dictation', (_event, overrideText?: string) => {
    stopRecordingAndInject(overrideText);
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

// Setup is only "needed" when the user has NO usable model. Previously this
// checked base.en specifically, so someone who already had tiny.en or small.en
// was still forced through a 142 MB download.
ipcMain.handle('is_setup_needed', () => listDownloadedModelIds().length === 0);

/**
 * Pull-based setup status. IPC pushed from the main process before the renderer
 * has mounted its listeners is dropped, which used to strand the setup screen at
 * "Preparing… 0%" forever. The UI polls this so a missed event self-corrects.
 */
ipcMain.handle('get_setup_status', () => ({
    phase: setupState.phase,
    percent: setupState.percent,
    error: setupState.error,
    hasModel: listDownloadedModelIds().length > 0,
}));

ipcMain.handle('check_microphone', () => {
    if (process.platform !== 'darwin') return true;
    try {
        return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
    } catch {
        return true;
    }
});

ipcMain.handle('request_microphone', async () => {
    return ensureMicrophoneAccess();
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

// AppleFnUsageType controls what macOS itself does when fn is pressed:
// 0 = Do Nothing, 1 = switch input source, 2 = Character Viewer (emoji picker),
// 3 = double-tap dictation. Wisper needs this at 0 so it's the only thing that
// reacts to fn — otherwise the system emoji picker/dictation fires alongside it.
ipcMain.handle('check_fn_key_setting', () => {
    return new Promise<{ configured: boolean; value: number | null }>((resolve) => {
        if (process.platform !== 'darwin') {
            resolve({ configured: true, value: 0 });
            return;
        }
        execFile('defaults', ['read', 'com.apple.HIToolbox', 'AppleFnUsageType'], (err, stdout) => {
            if (err) {
                // Key not set yet — macOS's out-of-box default opens the emoji picker.
                resolve({ configured: false, value: null });
                return;
            }
            const value = parseInt(stdout.trim(), 10);
            resolve({ configured: value === 0, value: Number.isNaN(value) ? null : value });
        });
    });
});

// ─── Custom dictionary ────────────────────────────────────────────────────────
// Persisted in userData so it survives updates. Entries do double duty: they are
// exact post-transcription replacements AND they seed whisper's initial_prompt,
// which biases the decoder toward these spellings so the fix often isn't needed.
/**
 * `word` is the correct spelling — that alone is usually enough, because it is
 * fed to whisper as initial_prompt and biases the decoder before it commits.
 * `heardAs` is the optional fallback for words the model still gets wrong, and
 * becomes an exact post-transcription replacement.
 */
interface DictionaryEntry { word: string; heardAs?: string }

function getDictionaryPath(): string {
    return path.join(app.getPath('userData'), 'dictionary.json');
}

function loadDictionary(): DictionaryEntry[] {
    try {
        const raw = fs.readFileSync(getDictionaryPath(), 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((e: any): DictionaryEntry | null => {
                if (!e) return null;
                // Migrate the earlier {from,to} shape: `to` was the correct spelling.
                if (typeof e.word !== 'string' && typeof e.to === 'string') {
                    return { word: String(e.to).trim(), heardAs: String(e.from ?? '').trim() || undefined };
                }
                if (typeof e.word !== 'string') return null;
                const heardAs = String(e.heardAs ?? '').trim();
                return { word: e.word.trim(), heardAs: heardAs || undefined };
            })
            .filter((e: DictionaryEntry | null): e is DictionaryEntry => !!e && !!e.word);
    } catch {
        return [];
    }
}

function saveDictionary(entries: DictionaryEntry[]): void {
    try {
        fs.writeFileSync(getDictionaryPath(), JSON.stringify(entries, null, 2), 'utf8');
    } catch (e: any) {
        console.warn('Failed to save dictionary:', e?.message || e);
    }
}

/** Push the dictionary into the live pipeline without needing a restart. */
function applyDictionary(entries: DictionaryEntry[]): void {
    const replacements: Record<string, string> = {};
    for (const e of entries) {
        if (e.heardAs) replacements[e.heardAs] = e.word;
    }
    // Every word biases the decoder, whether or not a fallback was supplied.
    const vocabulary = entries.map((e) => e.word).join(', ');
    pipeline?.setDictionary?.({ replacements, snippets: {} });
    pipeline?.setVocabulary?.(vocabulary);
}

/**
 * Permanently remove a downloaded model file to free disk space.
 *
 * Guarded: refuses to delete the last remaining model (that would leave the app
 * unable to transcribe at all), and switches the pipeline to another model
 * first if the one being deleted is currently active.
 */
ipcMain.handle('delete_model', (_event, modelId: string) => {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) return { success: false, error: 'Unknown model' };

    const downloaded = listDownloadedModelIds();
    if (!downloaded.includes(modelId)) {
        return { success: false, error: 'That model is not on this Mac' };
    }
    if (downloaded.length === 1) {
        return { success: false, error: 'This is your only speech model. Download another one first.' };
    }

    // Move off it before removing the file it points at.
    if (pipeline?.getActiveModelId() === modelId) {
        const fallback = downloaded.find((id) => id !== modelId);
        if (fallback && pipeline.setModel(fallback)) {
            sendToWindows('model_changed', fallback);
        }
    }

    const dir = getModelsDirPath();
    try {
        fs.unlinkSync(path.join(dir, model.filename));
        // Clean up a partial download left behind by an interrupted attempt.
        try { fs.unlinkSync(path.join(dir, `${model.filename}.tmp`)); } catch { /* none */ }
        model.downloaded = false;
        const models = pipeline?.refreshModelStatuses() ?? [];
        sendToWindows('pipeline_ready', { models, activeModel: pipeline?.getActiveModelId() });
        return { success: true, models, activeModel: pipeline?.getActiveModelId() };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Could not remove the file' };
    }
});

// ─── Emotion model (optional download) ───────────────────────────────────────
// Hosted as a GitHub release asset rather than bundled: it is 361 MB, and most
// users only want dictation. Everything below degrades gracefully when absent.
const EMOTION_MODEL_URL =
    'https://github.com/sainideep1234/my-wisper-emotion/releases/download/models-v1/emotion.onnx';

function getEmotionModelPath(): string {
    return path.join(app.getPath('userData'), 'models', 'emotion.onnx');
}

function isEmotionModelInstalled(): boolean {
    try {
        return fs.statSync(getEmotionModelPath()).size > 100 * 1024 * 1024;
    } catch {
        return false;
    }
}

ipcMain.handle('get_emotion_model_status', () => ({
    installed: isEmotionModelInstalled(),
    downloading: emotionDownloadActive,
    percent: emotionDownloadPercent,
    sizeLabel: '361 MB',
}));

let emotionDownloadActive = false;
let emotionDownloadPercent = 0;
// Held so a delete can abort an in-flight download. Without this, the download
// finishes after the delete and renames its .tmp over the file that was just
// removed — silently resurrecting a model the user asked us to erase.
let emotionDownloadReq: import('http').ClientRequest | null = null;
let emotionDownloadFile: fs.WriteStream | null = null;
let emotionDownloadCancelled = false;

ipcMain.handle('download_emotion_model', () => {
    if (emotionDownloadActive || isEmotionModelInstalled()) return { started: false };
    emotionDownloadActive = true;
    emotionDownloadPercent = 0;
    emotionDownloadCancelled = false;

    const target = getEmotionModelPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;

    const finish = (ok: boolean, error?: string) => {
        emotionDownloadActive = false;
        emotionDownloadReq = null;
        emotionDownloadFile = null;
        if (ok) pipeline?.setEmotionModelPath?.(target);
        sendToWindows('emotion_model_status', { installed: ok, downloading: false, percent: ok ? 100 : 0, error });
    };

    const get = (url: string) => {
        emotionDownloadReq = https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location);
            }
            if (res.statusCode !== 200) {
                try { fs.unlinkSync(tmp); } catch { /* none */ }
                return finish(false, `Download failed (${res.statusCode})`);
            }
            const total = parseInt(res.headers['content-length'] || '0', 10);
            let got = 0;
            const file = fs.createWriteStream(tmp);
            emotionDownloadFile = file;
            res.on('data', (c) => {
                got += c.length;
                emotionDownloadPercent = total ? Math.round((got / total) * 100) : 0;
                sendToWindows('emotion_model_status', { installed: false, downloading: true, percent: emotionDownloadPercent });
            });
            res.pipe(file);
            file.on('finish', () => file.close(() => {
                // Deleted mid-flight: drop the partial instead of promoting it.
                if (emotionDownloadCancelled) {
                    try { fs.unlinkSync(tmp); } catch { /* none */ }
                    return finish(false, 'Cancelled');
                }
                try {
                    fs.renameSync(tmp, target);
                    finish(true);
                } catch (e: any) { finish(false, e?.message); }
            }));
            file.on('error', (e) => { try { fs.unlinkSync(tmp); } catch { /* none */ } finish(false, e.message); });
        }).on('error', (e) => finish(false, e.message));
    };
    get(EMOTION_MODEL_URL);
    return { started: true };
});

/**
 * Erase the emotion model from disk for good.
 *
 * The previous version only unlinked emotion.onnx and reported success from the
 * absence of an exception, which was wrong in four ways: a partial
 * emotion.onnx.tmp survived (361 MB of dead weight), an in-flight download would
 * rename its .tmp back over the deleted file, ENOENT counted as a failure even
 * though "file is gone" is exactly what was asked for, and the ~538 MB inference
 * session stayed resident until the next idle sweep.
 *
 * This reports what is true on disk afterwards, not what it intended to do.
 */
ipcMain.handle('delete_emotion_model', () => {
    const target = getEmotionModelPath();
    const tmp = `${target}.tmp`;

    // 1. Stop any download before removing files, or it will undo this.
    emotionDownloadCancelled = true;
    try { emotionDownloadReq?.destroy(); } catch { /* already closed */ }
    try { emotionDownloadFile?.destroy(); } catch { /* already closed */ }
    emotionDownloadReq = null;
    emotionDownloadFile = null;
    emotionDownloadActive = false;
    emotionDownloadPercent = 0;

    // 2. Release the ONNX session so the file isn't in use and the RAM comes back now.
    pipeline?.setEmotionModelPath?.(null);

    // 3. Remove the model and any partial download.
    const removed: string[] = [];
    const errors: string[] = [];
    for (const f of [target, tmp]) {
        try {
            fs.unlinkSync(f);
            removed.push(path.basename(f));
        } catch (e: any) {
            if (e?.code !== 'ENOENT') errors.push(`${path.basename(f)}: ${e?.message}`);
        }
    }

    // 4. Confirm against the filesystem rather than trusting step 3.
    const stillPresent = fs.existsSync(target) || fs.existsSync(tmp);
    const success = !stillPresent && errors.length === 0;
    const error = stillPresent
        ? 'Files are still on disk after deletion'
        : errors.length
          ? errors.join('; ')
          : undefined;

    sendToWindows('emotion_model_status', {
        installed: isEmotionModelInstalled(),
        downloading: false,
        percent: 0,
        error,
    });
    return { success, removed, error };
});

ipcMain.handle('get_dictionary', () => loadDictionary());

ipcMain.handle('set_dictionary', (_event, entries: DictionaryEntry[]) => {
    const clean = (Array.isArray(entries) ? entries : [])
        .map((e) => {
            const heardAs = String(e?.heardAs ?? '').trim();
            return { word: String(e?.word ?? '').trim(), heardAs: heardAs || undefined };
        })
        .filter((e) => e.word);
    saveDictionary(clean);
    applyDictionary(clean);
    return clean;
});

ipcMain.handle('open_external_link', (_event, url: string) => {
    if (url) {
        shell.openExternal(url);
        return true;
    }
    return false;
});

ipcMain.handle('retry_setup', () => {
    if (listDownloadedModelIds().length === 0) {
        startDefaultModelDownload();
    }
    return { triggered: true };
});

ipcMain.handle('get_trigger_key', () => {
    return 'fn';
});

