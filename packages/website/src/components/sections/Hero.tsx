import { Activity } from "lucide-react";

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center pt-24 pb-16 text-center px-6">
      
      {/* Top Pill */}
      <div className="mb-6 flex items-center gap-3 rounded-full border border-white/10 bg-[#09090b] px-4 py-2 shadow-sm">
        <Activity className="h-4 w-4 text-blue-500" />
        <span className="text-sm text-zinc-300">High pace detected...</span>
        <div className="flex items-center gap-2 border-l border-white/10 pl-3">
          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">Energetic</span>
          <span className="text-xs text-zinc-500">11s</span>
        </div>
      </div>

      {/* Sub-pill text */}
      <div className="mb-6 flex items-center justify-center gap-2 text-sm text-blue-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
        <span>Online audio. Flawless text. Precise offline AI tool</span>
      </div>

      {/* Main Headline */}
      <h1 className="mb-6 max-w-4xl text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
        Wisper Emotion for macOS
      </h1>

      {/* Subheadline */}
      <p className="max-w-2xl text-lg text-zinc-400 sm:text-xl">
        Offline voice dictation & acoustic tone intelligence. Press{" "}
        <kbd className="inline-flex items-center justify-center rounded border border-white/20 bg-zinc-800 px-2 py-1 text-sm font-sans text-zinc-300">
          fn
        </kbd>{" "}
        or{" "}
        <kbd className="inline-flex items-center justify-center rounded border border-white/20 bg-zinc-800 px-2 py-1 text-sm font-sans text-zinc-300">
          ⌘ + Space
        </kbd>{" "}
        to transcribe into any active window.
      </p>
    </section>
  );
}
