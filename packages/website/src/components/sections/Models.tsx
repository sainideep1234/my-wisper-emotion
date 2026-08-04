import { CheckCircle2 } from "lucide-react";

export function Models() {
  const models = [
    {
      name: "Whisper Base (English)",
      badge: "Base.en",
      recommended: true,
      size: "142 MB",
      ram: "~500 MB RAM",
      desc: "Recommended Default: High speed and reliable everyday dictation accuracy.",
    },
    {
      name: "Whisper Tiny (English)",
      badge: "Tiny.en",
      recommended: false,
      size: "75 MB",
      ram: "~300 MB RAM",
      desc: "Ultra lightweight engine for quick voice snippets and low RAM environments.",
    },
    {
      name: "Whisper Small (English)",
      badge: "Small.en",
      recommended: false,
      size: "244 MB",
      ram: "~1.2 GB RAM",
      desc: "Balanced model for fast results, basic dictation, and low latency.",
    },
    {
      name: "Whisper Medium (English)",
      badge: "Medium.en",
      recommended: false,
      size: "1.5 GB",
      ram: "~3.0 GB RAM",
      desc: "Extreme precision for dense accents and noisy background environments.",
    },
    {
      name: "Whisper Large v3 (Multilingual)",
      badge: "Large-v3",
      recommended: false,
      size: "3.1 GB",
      ram: "~10 GB RAM",
      desc: "Benchmark maximum precision across 99+ international languages.",
    },
  ];

  return (
    <section id="models" className="mx-auto max-w-4xl px-6 py-20">
      <div className="mb-12 text-center">
        <h2 className="mb-4 text-3xl font-bold text-white">Supported Speech Models</h2>
        <p className="mx-auto max-w-2xl text-zinc-400">
          Whisper Emotion includes 5 local Whisper models. Select and switch to your preferred weights directly within the application.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {models.map((model) => (
          <div
            key={model.name}
            className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0f0f11] p-6 transition-colors hover:border-white/10 hover:bg-[#151518] sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-medium text-white">{model.name}</h3>
                <span className="rounded border border-white/20 bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300">
                  {model.badge}
                </span>
                {model.recommended && (
                  <span className="flex items-center gap-1 rounded bg-white px-2 py-0.5 text-xs font-semibold text-black">
                    <CheckCircle2 className="h-3 w-3" />
                    Recommended for Default
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400">{model.desc}</p>
            </div>
            
            <div className="flex shrink-0 flex-col text-left sm:text-right">
              <span className="font-medium text-white">{model.size}</span>
              <span className="text-xs text-zinc-500">{model.ram}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
