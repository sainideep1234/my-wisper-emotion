import { Download } from "lucide-react";

export function Steps() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-col gap-4">
        
        {/* Step 1 */}
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/5 bg-[#0f0f11] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/5 text-sm font-medium text-white ring-1 ring-white/10">
              1
            </div>
            <div>
              <h3 className="mb-1 text-lg font-medium text-white">Download Wisper Desktop App</h3>
              <p className="text-sm text-zinc-400">
                Unbox macOS Studio / Laptop, download app & let it run Whisper engine.
              </p>
            </div>
          </div>
          <button className="mt-4 flex shrink-0 items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 sm:mt-0">
            <Download className="h-4 w-4" />
            Download for macOS (DMG)
          </button>
        </div>

        {/* Step 2 */}
        <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-[#0f0f11] p-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/5 text-sm font-medium text-white ring-1 ring-white/10">
            2
          </div>
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Open app — default model downloads automatically</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Drag Whisper Emotion to Applications folder. On first run app downloads <span className="font-semibold text-zinc-200">Whisper Base (English) ~ 142 MB</span> in the background. No manual action required.
            </p>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-[#0f0f11] p-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/5 text-sm font-medium text-white ring-1 ring-white/10">
            3
          </div>
          <div>
            <h3 className="mb-1 text-lg font-medium text-white">Hold Key & Dictate Anywhere</h3>
            <p className="text-sm text-zinc-400">
              Press <kbd className="rounded border border-white/20 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">fn</kbd> in VS Code, Docs, or Mail to transcribe audio and analyze tone in real-time.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
