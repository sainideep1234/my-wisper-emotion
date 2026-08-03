import { exec } from 'child_process';
import { clipboard } from 'electron';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TextInjectionResult {
  success: boolean;
  inserted: boolean;
  copied: boolean;
  cursorFound: boolean;
}

export async function injectTextSystemWide(text: string): Promise<TextInjectionResult> {
  if (!text || !text.trim()) {
    return { success: false, inserted: false, copied: false, cursorFound: false };
  }

  // 1. Copy transcribed text to system clipboard
  clipboard.writeText(text);

  // 2. Perform native macOS Cmd+V keypress to paste text into active focused window
  if (process.platform === 'darwin') {
    const pasteScript = `
      tell application "System Events"
        delay 0.05
        keystroke "v" using command down
      end tell
    `;
    try {
      await execAsync(`osascript -e '${pasteScript.trim()}'`);
      return { success: true, inserted: true, copied: true, cursorFound: true };
    } catch (e) {
      console.warn('AppleScript Cmd+V paste fallback:', e);
      return { success: true, inserted: false, copied: true, cursorFound: false };
    }
  }

  return { success: true, inserted: false, copied: true, cursorFound: false };
}
