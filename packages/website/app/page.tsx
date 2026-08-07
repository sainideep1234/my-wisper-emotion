'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Download,
  Mic,
  Activity,
  Heart,
  ChevronDown,
  ClipboardList,
  Info,
  Star,
  ShieldAlert,
  Terminal,
  Check,
  Copy,
  ArrowDown,
} from 'lucide-react';
import { getDownloadUrl } from '@/lib/download';

export default function LandingPage() {
  const downloadUrl = getDownloadUrl();

  // "Copied" toast — shared by every copy-to-clipboard button on the page
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyToClipboard = (text: string, toastLabel: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToast(toastLabel);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedToast(null), 2000);
  };

  // Absolute origin for the curl command (curl needs a full URL, not a relative path)
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const xattrCommand = 'xattr -cr "/Applications/Wisper.app"';
  const curlCommand = `curl -L -o ~/Downloads/Wisper.dmg "${origin || 'https://wisper.app'}/api/download/mac"`;
  const [activeFeatureTab, setActiveFeatureTab] = useState<'dictation' | 'emotion' | 'clipboard'>(
    'dictation',
  );
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [isSimulatingRecord, setIsSimulatingRecord] = useState(true);
  const [simulatedEmotionIndex, setSimulatedEmotionIndex] = useState(0);

  const emotionModes = [
    { label: 'Calm', color: '#10B981', hint: 'Transcribing speech…' },
    { label: 'Energetic', color: '#38BDF8', hint: 'High pace detected…' },
    { label: 'Focused', color: '#0EA5E9', hint: 'Technical dictation…' },
    { label: 'Happy', color: '#34D399', hint: 'Expressive tone…' },
    { label: 'Thoughtful', color: '#94A3B8', hint: 'Steady pace…' },
  ];

  useEffect(() => {
    if (!isSimulatingRecord) return;
    const interval = setInterval(() => {
      setSimulatedEmotionIndex((prev) => (prev + 1) % emotionModes.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isSimulatingRecord, emotionModes.length]);

  const modelsList = [
    {
      id: 'base.en',
      name: 'Whisper Base (English)',
      weightSize: '142 MB',
      ramRequired: '~500 MB',
      recommended: true,
      description: 'Recommended Default: High speed and reliable everyday dictation accuracy.',
    },
    {
      id: 'tiny.en',
      name: 'Whisper Tiny (English)',
      weightSize: '75 MB',
      ramRequired: '~300 MB',
      recommended: false,
      description: 'Ultra-lightweight engine for quick voice triggers and low-RAM environments.',
    },
    {
      id: 'small.en',
      name: 'Whisper Small (English)',
      weightSize: '466 MB',
      ramRequired: '~1.2 GB',
      recommended: false,
      description: 'Enhanced accuracy for technical terminology, code dictation, and fast speech.',
    },
    {
      id: 'medium.en',
      name: 'Whisper Medium (English)',
      weightSize: '1.5 GB',
      ramRequired: '~2.6 GB',
      recommended: false,
      description: 'Superior precision for varied accents and noisy background environments.',
    },
    {
      id: 'large-v3',
      name: 'Whisper Large v3 (Multilingual)',
      weightSize: '3.1 GB',
      ramRequired: '~4.5 GB',
      recommended: false,
      description: 'Benchmark maximum precision across 99+ international languages.',
    },
  ];

  interface FaqItem {
    q: string;
    a: string;
    steps?: string[];
  }

  const faqItems: FaqItem[] = [
    {
      q: 'How does Wisper Emotion work on macOS?',
      a: 'Wisper Emotion runs as a native Electron desktop application on your Mac. It connects to an ultra-fast local C++ Whisper engine and acoustic neural classifier. Pressing fn or ⌘ ⌥ Space transcribes your voice and types text into your active editor or app.',
    },
    {
      q: 'What if macOS says "Wisper Emotion is damaged and can\'t be opened" or "Apple cannot verify this app"?',
      a: 'This standard macOS Gatekeeper security notice occurs for indie app builds downloaded from browsers, which quarantine anything they download. Because the app is not signed with an Apple Developer ID, macOS blocks quarantined copies. See the "Browser Download" vs "Terminal Install" options in the Installation section above — the Terminal (curl) install skips this entirely since curl never sets the quarantine flag. For the browser DMG, clear it in 10 seconds:',
      steps: [
        'Drag Wisper Emotion to your Applications folder.',
        'Open Terminal.app (press ⌘Space and type "Terminal").',
        'Copy and run this command: xattr -cr "/Applications/Wisper.app"',
        'Open Wisper Emotion normally from Applications or Launchpad.',
      ],
    },
    {
      q: 'Does any voice or dictation data leave my Mac?',
      a: 'No. 100% of speech recognition and tone classification executes locally on your device. Zero audio, text, or keystrokes are transmitted over the internet.',
    },
    {
      q: 'Which speech model should I use?',
      a: 'We strongly recommend Whisper Base (base.en - 142 MB). It provides sub-200ms latency, low RAM usage (~500 MB), and exceptional English dictation accuracy right out of the box.',
    },
    {
      q: 'What system requirements are recommended?',
      a: 'Wisper Emotion is optimized for Apple Silicon (M1/M2/M3/M4) and Intel Macs running macOS 12.0 or later with 8GB+ RAM.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      {/* ── TOP NAV BAR ── */}
      <header className="sticky top-0 z-50 bg-[#09090b]/90 border-b border-[#1c1c21] backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand Mark */}
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] flex items-center justify-center">
              <Image src="/logo.svg" alt="Wisper Logo" width={16} height={16} className="w-4 h-4" style={{ width: 'auto', height: 'auto' }} />
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">
              Wisper Emotion
            </span>
          </div>

          {/* Nav Links */}
          <nav className="hidden sm:flex items-center gap-6 text-xs font-medium text-zinc-400">
            <a href="#download" className="hover:text-white transition-colors">
              Download
            </a>
            <a href="#models" className="hover:text-white transition-colors">
              Models
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#installation" className="hover:text-white transition-colors">
              Installation
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
          </nav>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            <a
              href={downloadUrl}
              className="text-xs font-medium px-3.5 py-1.5 rounded-md bg-white text-zinc-950 hover:bg-zinc-200 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-zinc-950" />
              <span>Download DMG</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="pt-14 pb-12 md:pt-20 md:pb-16 border-b border-[#1c1c21]">
        <div className="max-w-3xl mx-auto px-4 text-center flex flex-col items-center">
          {/* Interactive Desktop Floating Overlay Pill Preview */}
          {(() => {
            const currentEmotion = emotionModes[simulatedEmotionIndex] ?? emotionModes[0]!;
            return (
              <div className="mb-6 w-full max-w-sm flex flex-col items-center">
                <div
                  onClick={() => {
                    if (!isSimulatingRecord) {
                      setIsSimulatingRecord(true);
                    } else {
                      setIsSimulatingRecord(false);
                    }
                  }}
                  className="relative group cursor-pointer select-none transition-all duration-300 transform hover:scale-[1.02]"
                  title="Click to cycle desktop app live emotion simulation"
                >
                  {/* Removed Pulsing Aura to align with minimal styling */}

                  {/* Floating Pill Container */}
                  <div
                    className="desktop-floating-pill relative px-4 py-2 rounded-full flex items-center justify-between gap-4 transition-all duration-300"
                    style={{
                      borderColor: isSimulatingRecord ? `${currentEmotion.color}44` : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Brand Logo */}
                      <div className="w-6 h-6 rounded-lg bg-[#121622] border border-[#232b3e] flex items-center justify-center p-0.5 shrink-0">
                        <Image src="/logo.svg" alt="Wisper Logo" width={16} height={16} className="w-4 h-4" style={{ width: 'auto', height: 'auto' }} />
                      </div>

                      {/* Live Equalizer Waveform */}
                      <div className="flex items-center gap-0.5 h-5 px-0.5">
                        {[0.6, 1.2, 0.8, 1.5, 0.7, 1.1, 0.5].map((mult, i) => (
                          <div
                            key={i}
                            className="w-[2.5px] rounded-full transition-all duration-150"
                            style={{
                              height: isSimulatingRecord ? `${Math.max(4, 16 * mult)}px` : '4px',
                              backgroundColor: isSimulatingRecord ? currentEmotion.color : '#3A4560',
                              animation: !isSimulatingRecord ? `wispr-idle-pulse 1.4s ease-in-out ${i * 0.08}s infinite` : undefined,
                            }}
                          />
                        ))}
                      </div>

                      <span className="text-xs font-semibold text-zinc-200 whitespace-nowrap">
                        {isSimulatingRecord ? currentEmotion.hint : 'Listening…'}
                      </span>
                    </div>

                    {/* Emotion Badge & Shortcut */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 transition-all duration-300"
                        style={{
                          backgroundColor: '#131824',
                          borderColor: `${currentEmotion.color}44`,
                          color: currentEmotion.color,
                        }}
                      >
                        <Activity className="w-2.5 h-2.5" />
                        <span>{currentEmotion.label}</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 bg-[#18181b] px-1.5 py-0.5 rounded border border-[#27272a]">
                        fn
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 mt-2.5 font-mono flex items-center gap-1.5">
                  <span 
                    className="w-1.5 h-1.5 rounded-full animate-pulse transition-colors duration-300" 
                    style={{ backgroundColor: currentEmotion.color }} 
                  />
                  <span>Native macOS Floating Pill Preview (Click to test tone)</span>
                </p>
              </div>
            );
          })()}


          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-3">
            Wisper Emotion for macOS
          </h1>

          {/* Subtitle with Single-Line Shortcut Formatting */}
          <p className="text-sm sm:text-base text-zinc-400 max-w-lg font-normal leading-relaxed mb-8">
            Offline voice dictation &amp; acoustic tone intelligence. Press{' '}
            <span className="inline-block whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-[#18181b] text-zinc-300 text-xs font-mono border border-[#27272a]">fn</kbd>
            </span>{' '}
            or{' '}
            <span className="inline-block whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-[#18181b] text-zinc-300 text-xs font-mono border border-[#27272a]">⌘ ⌥ Space</kbd>
            </span>{' '}
            to transcribe into any active window.
          </p>

          {/* ── STEP-BY-STEP DOWNLOAD STACK ── */}
          <div id="download" className="w-full max-w-xl flex flex-col gap-3 text-left">
            {/* STEP 1 CARD */}
            <div className="minimal-card rounded-xl p-5 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] text-xs font-mono font-medium flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">
                      Download Wisper Desktop App
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      Native macOS build (<code className="text-zinc-200 bg-[#18181b] px-1 py-0.5 rounded border border-[#27272a]">.dmg</code>) powered by local C++ Whisper engine.
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                      <a
                        href={downloadUrl}
                        className="px-4 py-2 rounded-md bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-xs shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-zinc-950" />
                        <span>Download for macOS (DMG)</span>
                      </a>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <a href="#installation" className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-medium transition-colors">
                    <span>Instructions</span>
                  </a>
                </div>
              </div>
            </div>

            {/* STEP 2 CARD */}
            <div className="minimal-card rounded-xl p-5 transition-colors">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] text-xs font-mono font-medium flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">
                    Open app — default model downloads automatically
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Drag Wisper Emotion to Applications, open it once, and the app downloads{' '}
                    <span className="text-zinc-200 font-semibold">Whisper Base (base.en — 142 MB)</span>{' '}
                    in the background. No manual setup required.
                  </p>
                </div>
              </div>
            </div>

            {/* STEP 3 CARD */}
            <div className="minimal-card rounded-xl p-5 transition-colors">
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] text-xs font-mono font-medium flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">
                    Hold Key &amp; Dictate Anywhere
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Press{' '}
                    <span className="inline-block whitespace-nowrap">
                      <kbd className="px-1.5 py-0.5 rounded bg-[#18181b] text-zinc-300 text-[10px] font-mono border border-[#27272a]">fn</kbd>
                    </span>{' '}
                    in VS Code, Slack, or Mail to transcribe audio and analyze tone in real-time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SUPPORTED MODELS MATRIX SECTION ── */}
      <section id="models" className="py-16 border-b border-[#1c1c21]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
              Supported Speech Models
            </h2>
            <p className="text-xs text-zinc-400">
              Wisper Emotion includes 5 local Whisper models. Select and download your preferred weights directly within the application.
            </p>
          </div>

          <div className="space-y-3">
            {modelsList.map((model) => (
              <div
                key={model.id}
                className={`minimal-card rounded-xl p-4 transition-all ${
                  model.recommended
                    ? 'border-zinc-500 bg-[#141418] shadow-sm'
                    : 'border-[#27272a] bg-[#121215]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{model.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#18181b] text-zinc-300 border border-[#27272a]">
                        {model.id}
                      </span>
                      {model.recommended && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-zinc-200 text-zinc-950 flex items-center gap-1 font-sans">
                          <Star className="w-3 h-3 fill-current" />
                          Recommended (Active Default)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{model.description}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs border-t sm:border-t-0 border-[#1c1c21] pt-2 sm:pt-0">
                    <div className="text-right">
                      <div className="text-zinc-300 font-mono font-medium">{model.weightSize}</div>
                      <div className="text-[10px] text-zinc-500">{model.ramRequired} RAM</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GATEKEEPER INSTRUCTIONS SECTION ── */}
      <section id="installation" className="max-w-4xl mx-auto px-4 py-8 w-full border-b border-[#1c1c21]">
        <div className="flex items-start gap-3.5 mb-5">
          <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-white text-sm mb-1">
              macOS Gatekeeper &amp; "Damaged App" Resolution
            </h4>
            <p className="text-zinc-400 text-xs leading-relaxed max-w-2xl">
              Since this is a custom local build outside the Mac App Store, macOS quarantines anything a browser
              downloads and says the app <span className="text-zinc-200">"is damaged and can't be opened."</span>{' '}
              Pick whichever install path you prefer — both end with the same working app.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {/* ── OPTION A: Browser DMG → requires the xattr command ── */}
          <div className="rounded-xl bg-[#121215] border border-amber-900/40 p-5 text-xs leading-relaxed flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                <Download className="w-3.5 h-3.5 text-zinc-300" />
              </span>
              <span className="text-sm font-medium text-white">Browser Download</span>
              <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                needs 1 command
              </span>
            </div>

            <a
              href={downloadUrl}
              className="px-4 py-2.5 rounded-md bg-white text-zinc-950 hover:bg-zinc-200 font-semibold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-zinc-950" />
              <span>Download for macOS (DMG)</span>
            </a>

            <p className="text-zinc-400">
              Drag <strong className="text-zinc-200">Wisper Emotion.app</strong> into <strong className="text-zinc-200">Applications</strong>, then run this in Terminal —
              it clears the quarantine flag the browser attached to the download:
            </p>

            {/* Connector: visually ties the download step to the command below it */}
            <div className="flex items-center gap-2 pl-1 text-[10px] font-medium text-amber-400/80 uppercase tracking-wide">
              <ArrowDown className="w-3 h-3" />
              <span>then run this</span>
            </div>

            <div className="bg-[#09090b] border border-amber-900/50 rounded-lg p-3 font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-3 select-all">
              <span className="overflow-x-auto whitespace-nowrap scrollbar-thin">{xattrCommand}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(xattrCommand, 'xattr command copied')}
                className="shrink-0 flex items-center gap-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
          </div>

          {/* ── OPTION B: curl install → no command needed afterward ── */}
          <div className="rounded-xl bg-[#121215] border border-emerald-900/40 p-5 text-xs leading-relaxed flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0">
                <Terminal className="w-3.5 h-3.5 text-zinc-300" />
              </span>
              <span className="text-sm font-medium text-white">Terminal Install</span>
              <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" />
                no command needed after
              </span>
            </div>

            <p className="text-zinc-400">
              Paste this into Terminal. <span className="text-zinc-200">curl</span> doesn't set the browser's quarantine
              flag, so macOS never blocks the app — nothing to clear afterward.
            </p>

            <div className="bg-[#09090b] border border-emerald-900/50 rounded-lg p-3 font-mono text-[11px] text-zinc-300 flex items-center justify-between gap-3 select-all mt-auto">
              <span className="overflow-x-auto whitespace-nowrap scrollbar-thin">{curlCommand}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(curlCommand, 'curl command copied')}
                className="shrink-0 flex items-center gap-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>

            <p className="text-zinc-500 text-[11px]">
              Then open the downloaded DMG and drag Wisper Emotion into Applications — that's it, no Terminal command afterward.
            </p>
          </div>
        </div>
      </section>

      {/* Shared "Copied" toast for every copy-to-clipboard button on the page */}
      {copiedToast && (
        <div
          className="fixed bottom-6 left-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a] shadow-lg shadow-black/40 text-xs font-medium text-zinc-100"
          style={{ animation: 'wispr-toast-in 0.2s ease-out' }}
        >
          <span className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Check className="w-2.5 h-2.5 text-emerald-400" />
          </span>
          <span>{copiedToast}</span>
        </div>
      )}

      {/* ── FEATURE SHOWCASE SECTION ── */}
      <section id="features" className="py-16 border-b border-[#1c1c21]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-8">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1.5">
              Core Capabilities
            </h2>
            <p className="text-xs text-zinc-400">
              Real-time voice dictation, acoustic emotion metrics, and instant system cursor injection.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
            <button
              onClick={() => setActiveFeatureTab('dictation')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeFeatureTab === 'dictation'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-[#121215] text-zinc-400 hover:text-zinc-200 border border-[#27272a]'
              }`}
            >
              Real-time Dictation
            </button>
            <button
              onClick={() => setActiveFeatureTab('emotion')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeFeatureTab === 'emotion'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-[#121215] text-zinc-400 hover:text-zinc-200 border border-[#27272a]'
              }`}
            >
              Acoustic Emotion Classifier
            </button>
            <button
              onClick={() => setActiveFeatureTab('clipboard')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeFeatureTab === 'clipboard'
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'bg-[#121215] text-zinc-400 hover:text-zinc-200 border border-[#27272a]'
              }`}
            >
              Clipboard History &amp; Auto-Paste
            </button>
          </div>

          {/* Interactive Frame */}
          <div className="minimal-card rounded-xl border border-[#27272a] overflow-hidden max-w-3xl mx-auto">
            <div className="px-4 py-3 bg-[#0d0d10] border-b border-[#1c1c21] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                Wisper Engine Studio
              </div>
              <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span>ONLINE</span>
              </div>
            </div>

            <div className="p-6 sm:p-8 min-h-[280px] flex flex-col justify-between bg-[#121215]">
              {activeFeatureTab === 'dictation' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-zinc-200" />
                      <span className="font-semibold text-white">Live Voice Stream</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#18181b] text-zinc-300 border border-[#27272a]">
                      Listening (fn held)
                    </span>
                  </div>

                  <div className="p-4 rounded-lg bg-[#09090b] border border-[#27272a] text-xs font-mono text-zinc-300 leading-relaxed min-h-[110px]">
                    <p>
                      "Drafting the architectural overview for our new Electron desktop engine. Wisper automatically captures vocal nuance and injects text into VS Code..."
                    </p>
                    <span className="inline-block w-1.5 h-3.5 bg-zinc-200 ml-1 animate-pulse" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2.5 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="text-zinc-500">Whisper Model</div>
                      <div className="font-medium text-zinc-200 mt-0.5">base.en</div>
                    </div>
                    <div className="p-2.5 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="text-zinc-500">Latency</div>
                      <div className="font-medium text-zinc-200 mt-0.5">&lt; 180ms</div>
                    </div>
                    <div className="p-2.5 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="text-zinc-500">Target</div>
                      <div className="font-medium text-zinc-200 mt-0.5">Active Window</div>
                    </div>
                    <div className="p-2.5 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="text-zinc-500">System RAM</div>
                      <div className="font-medium text-zinc-200 mt-0.5">~500 MB</div>
                    </div>
                  </div>
                </div>
              )}

              {activeFeatureTab === 'emotion' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Heart className="w-4 h-4 text-zinc-200" />
                      <span className="font-semibold text-white">Acoustic Tone Classifier</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#18181b] text-zinc-200 border border-[#27272a]">
                      Energetic (92%)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-3 rounded bg-[#09090b] border border-zinc-700">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-zinc-200">Energetic</span>
                        <span className="font-mono text-zinc-400">92%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-zinc-200 w-[92%]" />
                      </div>
                    </div>

                    <div className="p-3 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-zinc-400">Calm</span>
                        <span className="font-mono text-zinc-500">4%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-zinc-400 w-[4%]" />
                      </div>
                    </div>

                    <div className="p-3 rounded bg-[#09090b] border border-[#27272a]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-zinc-400">Focused</span>
                        <span className="font-mono text-zinc-500">2%</span>
                      </div>
                      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-zinc-400 w-[2%]" />
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 bg-[#09090b] p-3.5 rounded border border-[#27272a] leading-relaxed">
                    Wisper analyzes fundamental pitch frequencies, vocal energy, and acoustic cadence in real-time, tagging dictation sessions with tone metrics.
                  </p>
                </div>
              )}

              {activeFeatureTab === 'clipboard' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-zinc-200" />
                      <span className="font-semibold text-white">Smart Clipboard History</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#18181b] text-zinc-300 border border-[#27272a]">
                      Shift + C
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 rounded bg-[#09090b] border border-[#27272a] flex items-center justify-between">
                      <span className="text-zinc-300 font-mono text-[11px] truncate max-w-sm">"Build an Electron app for macOS distribution"</span>
                      <span className="text-zinc-500 text-[10px] font-mono">Just now</span>
                    </div>
                    <div className="p-3 rounded bg-[#09090b] border border-[#27272a] flex items-center justify-between">
                      <span className="text-zinc-400 font-mono text-[11px] truncate max-w-sm">"Wisper-Emotion-1.0.0-arm64.dmg"</span>
                      <span className="text-zinc-500 text-[10px] font-mono">2m ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ SECTION ── */}
      <section id="faq" className="py-16 border-b border-[#1c1c21]">
        <div className="max-w-3xl mx-auto px-4">
          <div className="mb-8">
            <h2 className="text-xl font-bold tracking-tight text-white mb-1">
              FAQ
            </h2>
            <p className="text-xs text-zinc-400">
              Essential questions on downloading, Gatekeeper approval, and local speech execution.
            </p>
          </div>

          <div className="space-y-2.5">
            {faqItems.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="minimal-card rounded-lg overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-4 hover:bg-[#18181b] transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-medium text-zinc-200">{item.q}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-2 text-xs text-zinc-400 leading-relaxed border-t border-[#1c1c21] space-y-3">
                      <p>{item.a}</p>
                      {item.steps && (
                        <div className="grid grid-cols-1 gap-2 pt-1">
                          {item.steps.map((step, sIdx) => (
                            <div key={sIdx} className="p-2.5 rounded-md bg-[#09090b] border border-[#27272a] flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded bg-[#18181b] border border-[#27272a] text-[10px] font-mono text-zinc-300 font-semibold flex items-center justify-center shrink-0">
                                {sIdx + 1}
                              </span>
                              <span className="text-zinc-300 text-xs">{step}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ACTIONABLE CLEAN FOOTER ── */}
      <footer className="bg-[#060608] py-8 text-xs text-zinc-500 border-t border-[#1c1c21]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: Brand mark */}
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#18181b] border border-[#27272a] flex items-center justify-center">
              <Image src="/logo.svg" alt="Wisper Logo" width={14} height={14} className="w-3.5 h-3.5" style={{ width: 'auto', height: 'auto' }} />
            </div>
            <span className="font-semibold text-sm text-white">Wisper Emotion</span>
          </div>

          {/* Center: Direct download & Nav links */}
          <div className="flex items-center gap-5 text-xs text-zinc-400">
            <a
              href={downloadUrl}
              className="hover:text-white transition-colors"
            >
              Download DMG
            </a>
            <a href="#models" className="hover:text-white transition-colors">
              Models
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#installation" className="hover:text-white transition-colors">
              Gatekeeper Setup
            </a>
            <a href="#faq" className="hover:text-white transition-colors">
              FAQ
            </a>
          </div>

          {/* Right: Engine status */}
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Local Engine Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
