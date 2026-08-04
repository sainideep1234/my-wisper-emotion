"use client";

import { Terminal, Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function GatekeeperCard() {
  const [copied, setCopied] = useState(false);
  const command = 'xattr -cr "/Applications/Wisper Emotion.app"';

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="installation" className="mx-auto max-w-4xl px-6 py-12">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f11] p-8 shadow-2xl shadow-black/50">
        
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1 rounded border border-white/20 bg-white/5 p-1.5 text-zinc-400">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-medium text-white">macOS Gatekeeper & "Damaged App" Resolution</h3>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-3xl">
              Since this is a custom local build outside the Mac App Store, macOS will quarantine the download and say the app "is damaged and can't be opened". You can clear the restriction and run it in 10 seconds:
            </p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/5 bg-black/50 p-4">
            <div className="mb-2 flex h-6 w-6 items-center justify-center rounded bg-white/10 text-xs font-medium text-white">1</div>
            <p className="text-sm text-zinc-300">Drag Wisper Emotion app to your Applications folder</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/50 p-4">
            <div className="mb-2 flex h-6 w-6 items-center justify-center rounded bg-white/10 text-xs font-medium text-white">2</div>
            <p className="text-sm text-zinc-300">Open Terminal app and run the command below</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/50 p-4">
            <div className="mb-2 flex h-6 w-6 items-center justify-center rounded bg-white/10 text-xs font-medium text-white">3</div>
            <p className="text-sm text-zinc-300">Launch Wisper Emotion normally from Applications</p>
          </div>
        </div>

        <div className="relative flex items-center justify-between rounded-lg border border-white/10 bg-black p-4 font-mono text-sm text-zinc-300">
          <code className="overflow-x-auto whitespace-pre pr-12">{command}</code>
          <button
            onClick={handleCopy}
            className="absolute right-3 flex h-8 items-center justify-center rounded-md border border-white/10 bg-[#18181b] px-3 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="h-4 w-4" /> : "Copy"}
          </button>
        </div>
        
      </div>
    </section>
  );
}
