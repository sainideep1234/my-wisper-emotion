import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#09090b] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
        
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Wisper Emotion Logo" className="h-6 w-6 rounded-full" />
          <span className="text-sm font-semibold text-white">Wisper Emotion</span>
        </div>

        {/* Links */}
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link href="#download" className="text-xs text-zinc-400 hover:text-white transition-colors">Download DMG</Link>
          <Link href="#models" className="text-xs text-zinc-400 hover:text-white transition-colors">Models</Link>
          <Link href="#features" className="text-xs text-zinc-400 hover:text-white transition-colors">Features</Link>
          <Link href="#installation" className="text-xs text-zinc-400 hover:text-white transition-colors">Gatekeeper Help</Link>
          <Link href="#faq" className="text-xs text-zinc-400 hover:text-white transition-colors">FAQ</Link>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
          <span className="text-xs text-zinc-400">Local Engine Ready</span>
        </div>

      </div>
    </footer>
  );
}
