export interface HistoryEntry {
  id: string;
  text: string;
  rawText: string;
  exe: string;
  title: string;
  kind: string;
  emotionLabel?: string;
  timestamp: number;
}

/**
 * In-memory searchable dictation history (never uploaded).
 */
export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  add(entry: Omit<HistoryEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number }): HistoryEntry {
    const full: HistoryEntry = {
      id: entry.id ?? String(Date.now()),
      timestamp: entry.timestamp ?? Date.now(),
      text: entry.text,
      rawText: entry.rawText,
      exe: entry.exe,
      title: entry.title,
      kind: entry.kind,
      emotionLabel: entry.emotionLabel,
    };
    this.entries = [full, ...this.entries].slice(0, this.maxEntries);
    return full;
  }

  list(): HistoryEntry[] {
    return [...this.entries];
  }

  search(query: string): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.list();
    return this.entries.filter(
      (e) =>
        e.text.toLowerCase().includes(q) ||
        e.exe.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q),
    );
  }

  last(): HistoryEntry | null {
    return this.entries[0] ?? null;
  }

  clear(): void {
    this.entries = [];
  }
}
