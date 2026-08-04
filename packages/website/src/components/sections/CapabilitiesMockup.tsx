import { Mic } from "lucide-react";

export function CapabilitiesMockup() {
  return (
    <section id="features" className="mx-auto max-w-5xl px-6 py-20">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-3xl font-bold text-white">Core Capabilities</h2>
        <p className="mx-auto max-w-2xl text-zinc-400">
          Real-time voice dictation, acoustic emotion metrics, and instant system buffer injection.
        </p>
        
        {/* Tabs */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black">
            Real-time Dictation
          </button>
          <button className="rounded-full border border-white/10 bg-[#0f0f11] px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white">
            Acoustic Emotion Classifier
          </button>
          <button className="rounded-full border border-white/10 bg-[#0f0f11] px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white">
            Command History & Auto-Paste
          </button>
        </div>
      </div>

      {/* App Mockup Window */}
      <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-[#09090b] shadow-2xl">
        {/* Window Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#121214] px-4 py-3">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-[#ff5f56] border border-black/10"></div>
            <div className="h-3 w-3 rounded-full bg-[#ffbd2e] border border-black/10"></div>
            <div className="h-3 w-3 rounded-full bg-[#27c93f] border border-black/10"></div>
          </div>
          <div className="text-xs font-semibold text-zinc-400">Wisper - Engine Studio</div>
          <div className="text-[10px] font-mono text-zinc-500">v1.0.0RC</div>
        </div>

        {/* Window Content */}
        <div className="p-6">
          <div className="rounded-lg border border-white/5 bg-[#121214]">
            {/* Inner Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Mic className="h-4 w-4" />
                Live Voice Stream
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
                [Recording: 15s/100%]
              </div>
            </div>
            
            {/* Text Area */}
            <div className="p-6 text-sm font-mono leading-relaxed text-zinc-300 h-32">
              "Testing the architectural precision for our new Emotion desktop engine. Adapts automatically for consumer vocal nuance and detects tone shifts in real...<span className="inline-block w-2 bg-white/80 h-4 animate-pulse align-middle ml-1"></span>"
            </div>
          </div>

          {/* Stats Footer */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-white/5 bg-[#121214] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Whisper Mode</div>
              <div className="text-sm font-medium text-zinc-200">Base.en</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#121214] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Latency</div>
              <div className="text-sm font-medium text-zinc-200">&lt; 150ms</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#121214] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Target</div>
              <div className="text-sm font-medium text-zinc-200">Active Window</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-[#121214] p-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">System RAM</div>
              <div className="text-sm font-medium text-zinc-200">~800 MB</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
