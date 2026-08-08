import { exec, execFile } from 'child_process';
import path from 'path';
import { clipboard, app, systemPreferences } from 'electron';
import { promisify } from 'util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export type InjectMethod = 'paste' | 'shift_insert' | 'clipboard_only';

export interface InjectTargetHints {
  isTerminal?: boolean;
  isElevated?: boolean;
  exe?: string;
  kind?: string;
}

export interface TextInjectionResult {
  success: boolean;
  inserted: boolean;
  copied: boolean;
  cursorFound: boolean;
  method: InjectMethod;
}

let automationPermissionShown = false;
let accessibilityPromptShown = false;

function getPasteHelperPath(): string {
  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;
  if (isDev) {
    return path.resolve(process.cwd(), 'bin', 'paste-helper');
  }
  return path.join(process.resourcesPath, 'bin', 'paste-helper');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickMethod(hints?: InjectTargetHints): InjectMethod {
  if (hints?.isElevated) return 'clipboard_only';
  const exe = (hints?.exe || '').toLowerCase();
  // Cursor / VS Code / Windsurf claim Ctrl/Cmd+V in some contexts — Shift+Insert is safer on Windows;
  // on macOS we still paste (Cmd+V) which works in editors.
  if (process.platform === 'win32' && /code|cursor|windsurf/.test(exe)) {
    return 'shift_insert';
  }
  return 'paste';
}

async function pasteViaNativeHelper(): Promise<boolean> {
  try {
    await execFileAsync(getPasteHelperPath());
    return true;
  } catch (e: any) {
    console.warn('Native paste failed:', e?.message || e);
    return false;
  }
}

async function pasteViaAppleScript(): Promise<boolean> {
  try {
    const script = 'tell application "System Events" to keystroke "v" using command down';
    await execFileAsync('osascript', ['-e', script]);
    return true;
  } catch (e: any) {
    const isAuthError = e?.stderr?.includes('-1743') || e?.message?.includes('-1743') || e?.message?.includes('1002');
    if (isAuthError && !automationPermissionShown) {
      automationPermissionShown = true;
      console.log('\n================================================================');
      console.log('TIP: For auto-paste, grant Automation permission:');
      console.log('  System Settings → Privacy & Security → Automation');
      console.log('  → Enable "System Events" for this app');
      console.log('(Text was copied — press Cmd+V manually for now)');
      console.log('================================================================\n');
    } else if (!isAuthError) {
      console.warn('AppleScript paste failed:', e?.message || e);
    }
    return false;
  }
}

async function pasteWindows(method: InjectMethod): Promise<boolean> {
  try {
    if (method === 'shift_insert') {
      await execFileAsync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('+{INSERT}')"
      ]);
    } else {
      await execFileAsync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
      ]);
    }
    return true;
  } catch (e: any) {
    console.warn('Windows paste failed:', e?.message || e);
    return false;
  }
}

/**
 * Per-target text injection.
 * Always copies to clipboard first; attempts synthetic paste unless elevated.
 */
export async function injectTextSystemWide(
  text: string,
  hints?: InjectTargetHints,
): Promise<TextInjectionResult> {
  if (!text || !text.trim()) {
    return { success: false, inserted: false, copied: false, cursorFound: false, method: 'clipboard_only' };
  }

  const method = pickMethod(hints);
  clipboard.writeText(text);
  await delay(30);


  if (method === 'clipboard_only') {
    return { success: true, inserted: false, copied: true, cursorFound: false, method };
  }

  if (process.platform === 'darwin') {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      // Passing `true` opens the system prompt. Doing that on every failed paste
      // re-asked for permission over and over; prompt at most once per session
      // and let the in-app banner carry the message after that.
      if (!accessibilityPromptShown) {
        accessibilityPromptShown = true;
        systemPreferences.isTrustedAccessibilityClient(true);
      }
      if (!automationPermissionShown) {
        automationPermissionShown = true;
        console.log('\n================================================================');
        console.log('NOTE: Accessibility required for auto-paste.');
        console.log('Please enable Electron in: System Settings → Privacy & Security → Accessibility');
        console.log('(Text was copied — press Cmd+V manually for now)');
        console.log('================================================================\n');
      }
      return { success: true, inserted: false, copied: true, cursorFound: false, method: 'clipboard_only' };
    }

    if (await pasteViaNativeHelper()) {
      return { success: true, inserted: true, copied: true, cursorFound: true, method };
    }
    if (await pasteViaAppleScript()) {
      return { success: true, inserted: true, copied: true, cursorFound: true, method };
    }
  } else if (process.platform === 'win32') {
    if (await pasteWindows(method)) {
      return { success: true, inserted: true, copied: true, cursorFound: true, method };
    }
  }

  return { success: true, inserted: false, copied: true, cursorFound: false, method };
}
