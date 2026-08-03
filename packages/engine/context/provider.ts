import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freezeContext, type AppKind, type UtteranceContext, emptyContext } from './utterance.ts';

const execFileAsync = promisify(execFile);

const TERMINAL_EXES = new Set([
  'terminal', 'terminal.app', 'iterm', 'iterm2', 'iterm2.app',
  'alacritty', 'kitty', 'warp', 'warp.app', 'wezterm', 'hyper',
  'ghostty', 'tabby', 'macos terminal',
]);

const CHAT_EXES = new Set([
  'slack', 'discord', 'messages', 'whatsapp', 'telegram', 'signal',
  'microsoft teams', 'teams', 'element', 'zoom',
]);

const EDITOR_EXES = new Set([
  'code', 'visual studio code', 'cursor', 'windsurf', 'sublime text',
  'nova', 'bbedit', 'zed', 'vim', 'nvim', 'emacs',
]);

const BROWSER_EXES = new Set([
  'safari', 'google chrome', 'chrome', 'firefox', 'arc', 'brave browser',
  'microsoft edge', 'opera', 'dia',
]);

function classify(exe: string, title: string): AppKind {
  const key = exe.toLowerCase().replace(/\.app$/, '').trim();
  if (TERMINAL_EXES.has(key)) return 'terminal';
  if (CHAT_EXES.has(key)) return 'chat';
  if (EDITOR_EXES.has(key)) return 'editor';
  if (BROWSER_EXES.has(key)) return 'browser';
  const t = title.toLowerCase();
  if (/\b(bash|zsh|fish|pwsh|powershell|cmd)\b/.test(t)) return 'terminal';
  if (/\b(slack|discord|whatsapp|teams)\b/.test(t)) return 'chat';
  return 'other';
}

async function frontmostMac(): Promise<{ exe: string; title: string; bundleId: string }> {
  const script = `
    tell application "System Events"
      set p to first application process whose frontmost is true
      set n to name of p
      set b to bundle identifier of p
      set t to ""
      try
        set t to name of first window of p
      end try
      return n & tab & b & tab & t
    end tell
  `;
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 1500 });
    const [exe = '', bundleId = '', ...rest] = stdout.trim().split('\t');
    return { exe: exe.trim(), title: rest.join('\t').trim(), bundleId: bundleId.trim() };
  } catch {
    return { exe: '', title: '', bundleId: '' };
  }
}

/**
 * Captures foreground app metadata at hotkey-press time.
 * All local — nothing leaves the machine.
 */
export class ContextProvider {
  private readCaretText = false;

  setReadCaretText(enabled: boolean) {
    this.readCaretText = enabled;
  }

  async capture(locale = 'en-US'): Promise<UtteranceContext> {
    if (process.platform !== 'darwin') {
      return emptyContext();
    }

    const { exe, title, bundleId } = await frontmostMac();
    const kind = classify(exe, title);
    const isTerminal = kind === 'terminal';
    const isChat = kind === 'chat';

    let caretText: string | null = null;
    if (this.readCaretText) {
      caretText = await this.tryCaretText();
    }

    return freezeContext({
      startedAt: Date.now(),
      exe,
      title,
      bundleId,
      kind,
      isTerminal,
      isChat,
      isElevated: false,
      locale,
      caretText,
    });
  }

  private async tryCaretText(): Promise<string | null> {
    // Opt-in only — Accessibility required. Best-effort; never throws.
    try {
      const script = `
        tell application "System Events"
          set p to first application process whose frontmost is true
          try
            set fe to focused of p
            if fe is missing value then return ""
            try
              return value of attribute "AXSelectedText" of fe
            end try
            return ""
          end try
        end tell
      `;
      const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 800 });
      const text = stdout.trim();
      return text || null;
    } catch {
      return null;
    }
  }
}
