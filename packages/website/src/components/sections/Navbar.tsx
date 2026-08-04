import { Download } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Wisper Emotion Logo" className="h-8 w-8 rounded-full" />
          <span className="font-semibold text-white">Wisper Emotion</span>
        </div>

        {/* Links */}
        <div className="hidden items-center gap-8 md:flex">
          <Link href="#download" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Download
          </Link>
          <Link href="#models" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Models
          </Link>
          <Link href="#features" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Features
          </Link>
          <Link href="#installation" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Installation
          </Link>
          <Link href="#faq" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            FAQ
          </Link>
        </div>

        {/* CTA */}
        <div className="flex items-center">
          <button className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90">
            <Download className="h-4 w-4" />
            Download DMG
          </button>
        </div>
      </div>
    </nav>
  );
}
