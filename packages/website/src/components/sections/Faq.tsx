import { ChevronDown } from "lucide-react";

export function Faq() {
  const faqs = [
    {
      question: "How does Wisper Emotion work on macOS?",
      answer:
        "Wisper Emotion runs a native Electron desktop application on your Mac. It communicates with a fast local C++ Whisper engine and a mobile neural classifier. Pressing fn or ⌘ + Space transcribes your voice and types text into your active editor or app.",
      open: true,
    },
    {
      question: "Why is macOS saying 'Wisper Emotion is damaged and can't be opened' or 'Apple cannot verify this app'?",
      answer: "Since this is an unsigned app distributed outside the Mac App Store, Gatekeeper may flag it. You can bypass this by running the provided xattr command in your Terminal to clear the quarantine attribute.",
    },
    {
      question: "Does my voice or dictation data leave my Mac?",
      answer: "No. All voice processing, dictation, and acoustic analysis happens 100% locally on your machine. No audio or text is sent to the cloud.",
    },
    {
      question: "Which speech model should I use?",
      answer: "We recommend 'Whisper Base (English)' for most users. It provides an excellent balance of speed and accuracy. If you have an M-series chip with more RAM, you can use 'Small' or 'Medium' for higher accuracy.",
    },
    {
      question: "What system requirements are recommended?",
      answer: "An Apple Silicon (M1/M2/M3) Mac with at least 8GB of RAM is highly recommended for optimal real-time performance. Intel Macs are supported but may experience slightly higher latency.",
    },
  ];

  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
      <div className="mb-10">
        <h2 className="mb-2 text-2xl font-bold text-white">FAQ</h2>
        <p className="text-sm text-zinc-400">
          Essential questions on downloading, Gatekeeper warnings, and local model installation.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {faqs.map((faq, index) => (
          <details
            key={index}
            className="group rounded-xl border border-white/5 bg-[#0f0f11] transition-colors hover:border-white/10"
            open={faq.open}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-medium text-white focus:outline-none">
              {faq.question}
              <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="border-t border-white/5 px-5 pb-5 pt-4 text-sm leading-relaxed text-zinc-400">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
