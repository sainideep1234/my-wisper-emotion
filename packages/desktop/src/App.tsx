import React, { useState, useEffect, useRef } from 'react';
import {
  IconMic,
  IconActivity,
  IconCpu,
  IconHeart,
  IconGear,
  IconWaves,
  IconCopy,
  IconCheck,
  IconDownload,
  IconSpinner,
  IconShield,
  IconBolt,
  IconFire,
  IconFace,
  IconTarget,
  IconLeaf,
  IconMoon,
  IconStar,
  IconClipboard,
  IconTrash,
  IconLogo,
} from './icons';

/**
 * Plain-language labels for the speech options. The engine names them after the
 * underlying Whisper weights ("Whisper Base (English)", RAM figures, .bin sizes),
 * which means nothing to someone who just wants to dictate.
 */
const FRIENDLY_MODELS: Record<string, { title: string; bestFor: string }> = {
  'tiny.en': { title: 'Fastest', bestFor: 'Quick notes and short messages' },
  'base.en': { title: 'Everyday', bestFor: 'Good balance of speed and accuracy' },
  'small.en': { title: 'More accurate', bestFor: 'Technical words and names' },
  'medium.en': { title: 'Very accurate', bestFor: 'Strong accents or noisy rooms' },
  'large-v3': { title: 'Most accurate', bestFor: 'Other languages, slowest to respond' },
};

interface ModelInfo {
  id: string;
  name: string;
  weightSize: string;
  ramRequired: string;
  filename: string;
  downloaded: boolean;
  description: string;
}

interface DownloadState {
  percent: number;
  active: boolean;
}

interface EmotionData {
  label: string;
  confidence: number;
  scores: Record<string, number>;
}

// ── Strict Color System (NO purple, NO orange, NO red, NO gradients) ──────
export const getEmotionColor = (label?: string): string => {
  switch (label) {
    case 'Energetic':
      return '#38BDF8'; // Sky Cyan
    case 'Happy':
      return '#34D399'; // Soft Mint Green
    case 'Focused':
      return '#0EA5E9'; // Deep Cyan
    case 'Calm':
      return '#10B981'; // Vibrant Emerald
    case 'Thoughtful':
      return '#94A3B8'; // Cool Slate
    case 'Neutral':
    default:
      return '#64748B'; // Muted Slate
  }
};

const EmotionIcon = ({
  label,
  size = 16,
  color,
}: {
  label?: string;
  size?: number;
  color?: string;
}) => {
  const c = color ?? getEmotionColor(label);
  switch (label) {
    case 'Energetic':
      return <IconBolt size={size} color={c} />;
    case 'Happy':
      return <IconFace size={size} color={c} />;
    case 'Focused':
      return <IconTarget size={size} color={c} />;
    case 'Calm':
      return <IconLeaf size={size} color={c} />;
    case 'Thoughtful':
      return <IconMoon size={size} color={c} />;
    case 'Neutral':
    default:
      return <IconStar size={size} color={c} />;
  }
};

const ALL_EMOTIONS = ['Energetic', 'Happy', 'Focused', 'Calm', 'Thoughtful', 'Neutral'];

export const App: React.FC = () => {
  // Check if running inside the floating overlay window
  const isOverlay =
    typeof window !== 'undefined' &&
    (window.location.search.includes('overlay=1') || window.location.hash.includes('overlay=1'));

  const [activeTab, setActiveTab] = useState<'dictate' | 'models' | 'emotions' | 'settings' | 'clipboard' | 'dictionary'>(
    'dictate',
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isLongSession, setIsLongSession] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [smoothLevel, setSmoothLevel] = useState(0);
  const smoothLevelRef = useRef(0);
  const [liveEmotion, setLiveEmotion] = useState<EmotionData | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('base.en');
  const [history, setHistory] = useState<
    { id: string; text: string; emotion: EmotionData | null; timestamp: string; cursorFound: boolean }[]
  >([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<Record<string, DownloadState>>({});
  const [clipboardHistory, setClipboardHistory] = useState<{ id: string; text: string; timestamp: string }[]>([]);
  const [shiftCPasteEnabled, setShiftCPasteEnabled] = useState(true);
  const [clipboardSearch, setClipboardSearch] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [partialText, setPartialText] = useState('');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const buttonRecordingRef = useRef(false);

  // Cursor detection status pop state
  const [lastNoCursorText, setLastNoCursorText] = useState<string | null>(null);
  const [showNoCursorPop, setShowNoCursorPop] = useState(false);

  // First launch wizard gate
  const [firstLaunchGate, setFirstLaunchGate] = useState<'checking' | 'needed' | 'done'>('checking');
  const [setupPercent, setSetupPercent] = useState(0);
  const [setupPhase, setSetupPhase] = useState<'waiting' | 'downloading' | 'done' | 'error'>('waiting');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [accessibilityGranted, setAccessibilityGranted] = useState(true);
  const [microphoneGranted, setMicrophoneGranted] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; notes: string } | null>(null);
  const [fnKeyAccessible, setFnKeyAccessible] = useState(true);

  // Fn key native-action gate: blocks the dashboard until macOS's "Press fn key
  // to" preference is verifiably set to "Do Nothing" (AppleFnUsageType === 0),
  // so Wisper is the only thing that reacts to fn. Checked via a real read of
  // the system preference, not a self-reported checkbox.
  const [fnKeyGate, setFnKeyGate] = useState<'checking' | 'needed' | 'done'>('checking');
  const [fnKeyValue, setFnKeyValue] = useState<number | null>(null);

  // Custom dictionary (persisted in userData by the main process)
  const [dictionary, setDictionary] = useState<{ word: string; heardAs?: string }[]>([]);
  const [dictWord, setDictWord] = useState('');
  const [dictHeardAs, setDictHeardAs] = useState('');
  const [dictShowFallback, setDictShowFallback] = useState(false);
  const [dictSaved, setDictSaved] = useState(false);

  // Model deletion: two-step confirm, since this erases a multi-hundred-MB file
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Smooth audio level for overlay wave animation (Whisper Flow style)
  useEffect(() => {
    if (!isOverlay) return;
    let raf = 0;
    const tick = () => {
      const target = isRecording ? audioLevel : 0;
      smoothLevelRef.current += (target - smoothLevelRef.current) * 0.25;
      if (Math.abs(smoothLevelRef.current - target) < 0.001) {
        smoothLevelRef.current = target;
      }
      setSmoothLevel(smoothLevelRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOverlay, audioLevel, isRecording]);

  // Transparent window chrome for the floating overlay (macOS panel)
  useEffect(() => {
    if (!isOverlay) return;
    const prev = { bg: document.body.style.background, margin: document.body.style.margin };
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = prev.bg;
      document.body.style.margin = prev.margin;
    };
  }, [isOverlay]);

  const refreshModels = () => {
    window.electronAPI?.getModels().then((data) => {
      if (Array.isArray(data) && data.length > 0) setModels(data);
    });
  };

  useEffect(() => {
    if (!window.electronAPI) {
      setFirstLaunchGate('done');
      return;
    }
    window.electronAPI.isSetupNeeded?.().then((needed: boolean) => {
      if (needed) {
        setFirstLaunchGate('needed');
        setSetupPhase('waiting');
      } else {
        setFirstLaunchGate('done');
      }
    });

    // Poll the real setup state. Events pushed before this component mounted are
    // dropped by Electron, which previously left the screen stuck at "Preparing… 0%".
    const pollSetup = setInterval(() => {
      window.electronAPI.getSetupStatus?.().then((s) => {
        if (!s) return;
        if (s.hasModel || s.phase === 'done') {
          setSetupPercent(100);
          setSetupPhase('done');
          setTimeout(() => setFirstLaunchGate('done'), 400);
          clearInterval(pollSetup);
          return;
        }
        if (s.phase === 'error') {
          setSetupPhase('error');
          setSetupError(s.error || null);
          return;
        }
        if (s.phase === 'downloading') {
          setSetupPhase('downloading');
          setSetupPercent(s.percent);
        }
      });
    }, 700);

    const checkAccess = () => {
      window.electronAPI.checkAccessibility?.().then((granted) => {
        setAccessibilityGranted(granted);
      });
      window.electronAPI.checkMicrophone?.().then((granted) => {
        setMicrophoneGranted(granted);
      });
    };
    checkAccess();
    const interval = setInterval(checkAccess, 3000);
    return () => {
      clearInterval(interval);
      clearInterval(pollSetup);
    };
  }, []);

  const handleRequestAccessibility = async () => {
    if (window.electronAPI) {
      const ok = await window.electronAPI.requestAccessibility();
      setAccessibilityGranted(ok);
    }
  };

  const handleRequestMicrophone = async () => {
    if (window.electronAPI) {
      const ok = await window.electronAPI.requestMicrophone();
      setMicrophoneGranted(ok);
    }
  };

  const handleOpenKeyboardSettings = () => {
    window.electronAPI?.openExternalLink?.('x-apple.systempreferences:com.apple.preference.keyboard');
  };

  useEffect(() => {
    window.electronAPI?.getDictionary?.().then((entries) => {
      if (Array.isArray(entries)) setDictionary(entries);
    });
  }, []);

  const persistDictionary = async (next: { word: string; heardAs?: string }[]) => {
    setDictionary(next);
    const saved = await window.electronAPI?.setDictionary?.(next);
    if (Array.isArray(saved)) setDictionary(saved);
    setDictSaved(true);
    setTimeout(() => setDictSaved(false), 1800);
  };

  const handleAddDictionaryEntry = () => {
    const word = dictWord.trim();
    if (!word) return;
    const heardAs = dictHeardAs.trim() || undefined;
    // Same word added again just updates its fallback
    const next = [...dictionary.filter((e) => e.word.toLowerCase() !== word.toLowerCase()), { word, heardAs }];
    setDictWord('');
    setDictHeardAs('');
    setDictShowFallback(false);
    void persistDictionary(next);
  };

  const handleRemoveDictionaryEntry = (word: string) => {
    void persistDictionary(dictionary.filter((e) => e.word !== word));
  };

  useEffect(() => {
    if (!window.electronAPI?.checkFnKeySetting) {
      setFnKeyGate('done');
      return;
    }
    let cancelled = false;
    const check = () => {
      window.electronAPI.checkFnKeySetting().then(({ configured, value }) => {
        if (cancelled) return;
        setFnKeyValue(value);
        setFnKeyGate(configured ? 'done' : 'needed');
      });
    };
    check();
    const interval = setInterval(check, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;

    refreshModels();

    const unsubAudio = window.electronAPI.onAudioLevel?.((level) => {
      setAudioLevel(level);
    });

    const unsubReady = window.electronAPI.onPipelineReady((data) => {
      if (Array.isArray(data.models) && data.models.length > 0) {
        setModels(data.models);
      }
      if (data.activeModel) setSelectedModel(data.activeModel);
    });

    const unsubDownload = window.electronAPI.onDownloadProgress((data) => {
      setDownloadState((prev) => ({
        ...prev,
        [data.modelId]: { percent: data.percent, active: !data.done },
      }));
      if (data.done && !data.error) refreshModels();
      if (data.modelId === 'base.en') {
        if (data.error) {
          setSetupError(data.error ?? 'Download failed');
          setSetupPhase('error');
        } else {
          setSetupPercent(data.percent);
          if (!data.done) setSetupPhase('downloading');
        }
      }
    });

    const unsubSetupStart = window.electronAPI.onSetupStarted?.(() => {
      setSetupPhase('downloading');
      setSetupError(null);
      setSetupPercent(0);
    });

    const unsubSetupComplete = window.electronAPI.onSetupComplete?.((data) => {
      if (data.modelId === 'base.en') {
        if (data.success) {
          setSetupPercent(100);
          setSetupPhase('done');
          setTimeout(() => {
            setFirstLaunchGate('done');
            refreshModels();
          }, 800);
        } else {
          setSetupPhase('error');
          setSetupError('Download failed. Please check your network connection.');
        }
      }
    });

    const unsubState = window.electronAPI.onRecordingStateChanged((data) => {
      setIsRecording(data.isRecording);
      setIsLongSession(data.isLongSession);
      setIsProcessing(!!(data as { isProcessing?: boolean }).isProcessing);
      if (!data.isRecording) {
        if (!(data as { isProcessing?: boolean }).isProcessing) {
          setLiveEmotion(null);
          setAudioLevel(0);
          setPartialText('');
        }
      }
    });

    const unsubLiveEmo = window.electronAPI.onLiveEmotion((emo) => {
      setLiveEmotion(emo);
    });

    const unsubPartial = window.electronAPI.onPartialTranscript?.((data) => {
      const shown = [data.committed, data.pending].filter(Boolean).join(' ');
      setPartialText(shown);
      if (shown) setLastTranscript(shown);
    });

    const unsubResult = window.electronAPI.onDictationResult((res) => {
      setPartialText('');
      setShowNoCursorPop(false);
      if (res.text) {
        setLastTranscript(res.text);
        setHistory((prev) => [
          {
            id: String(Date.now()),
            text: res.text,
            emotion: res.emotion,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            cursorFound: res.cursorFound,
          },
          ...prev,
        ]);
        // Never pop a transcript modal — text is pasted (or left on clipboard) silently
      }
    });

    const unsubModel = window.electronAPI.onModelChanged((mId) => {
      setSelectedModel(mId);
    });

    window.electronAPI.getClipboardHistory?.().then((hist) => {
      if (Array.isArray(hist)) setClipboardHistory(hist);
    });

    const unsubClipboard = window.electronAPI.onClipboardHistoryUpdated?.((hist) => {
      setClipboardHistory(hist);
    });

    const unsubUpdate = window.electronAPI.onUpdateAvailable?.((data) => {
      setUpdateInfo(data);
    });

    window.electronAPI.getShiftCPasteEnabled?.().then((val) => {
      setShiftCPasteEnabled(val);
    });

    const unsubAccessibility = window.electronAPI.onAccessibilityStatus?.((data) => {
      setFnKeyAccessible(data.granted);
      setAccessibilityGranted(data.granted);
    });

    const unsubPipelineError = window.electronAPI.onPipelineError?.((data) => {
      setPipelineError(data.message);
    });

    const unsubMic = window.electronAPI.onMicrophoneStatus?.((data) => {
      setMicrophoneGranted(data.granted);
    });

    return () => {
      if (unsubAudio) unsubAudio();
      unsubReady();
      unsubDownload();
      if (unsubSetupStart) unsubSetupStart();
      if (unsubSetupComplete) unsubSetupComplete();
      unsubState();
      unsubLiveEmo();
      if (unsubPartial) unsubPartial();
      unsubResult();
      unsubModel();
      if (unsubClipboard) unsubClipboard();
      if (unsubUpdate) unsubUpdate();
      if (unsubAccessibility) unsubAccessibility();
      if (unsubPipelineError) unsubPipelineError();
      if (unsubMic) unsubMic();
    };
  }, []);

  // Release-to-stop when user drags off the hold button
  useEffect(() => {
    if (!buttonRecordingRef.current) return;
    const stopIfButtonHeld = () => {
      if (buttonRecordingRef.current && isRecording) {
        buttonRecordingRef.current = false;
        window.electronAPI?.stopDictation();
      }
    };
    window.addEventListener('mouseup', stopIfButtonHeld);
    window.addEventListener('touchend', stopIfButtonHeld);
    return () => {
      window.removeEventListener('mouseup', stopIfButtonHeld);
      window.removeEventListener('touchend', stopIfButtonHeld);
    };
  }, [isRecording]);

  const handleRetrySetup = () => {
    setSetupPhase('waiting');
    setSetupError(null);
    setSetupPercent(0);
    window.electronAPI?.retrySetup?.();
  };

  const handleRecordStart = () => {
    if (isRecording) return;
    buttonRecordingRef.current = true;
    setPipelineError(null);
    window.electronAPI?.startDictation(false);
  };

  const handleRecordStop = () => {
    if (!buttonRecordingRef.current && !isRecording) return;
    buttonRecordingRef.current = false;
    window.electronAPI?.stopDictation();
  };

  const handleDeleteModel = async (m: ModelInfo) => {
    setConfirmDeleteId(null);
    const res = await window.electronAPI?.deleteModel?.(m.id);
    if (!res?.success) {
      setModelError(res?.error || 'Could not remove that model.');
      return;
    }
    setModelError(null);
    if (Array.isArray(res.models)) setModels(res.models);
    if (res.activeModel) setSelectedModel(res.activeModel);
  };

  const handleSelectModel = async (m: ModelInfo) => {
    if (!m.downloaded) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.selectModel(m.id);
      if (res.success && res.activeModel) setSelectedModel(res.activeModel);
    }
  };

  const handleDownload = async (m: ModelInfo) => {
    if (!window.electronAPI) return;
    setDownloadState((prev) => ({ ...prev, [m.id]: { percent: 0, active: true } }));
    await window.electronAPI.downloadModel(m.id);
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    window.electronAPI?.copyLastText?.();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyNoCursorText = () => {
    if (lastNoCursorText) {
      navigator.clipboard.writeText(lastNoCursorText);
      window.electronAPI?.copyLastText?.();
      setShowNoCursorPop(false);
    }
  };

  const handleToggleShiftC = async (val: boolean) => {
    setShiftCPasteEnabled(val);
    await window.electronAPI.setShiftCPasteEnabled?.(val);
  };

  const handleClearClipboard = async () => {
    await window.electronAPI.clearClipboardHistory?.();
  };

  const handlePasteClipboard = async (text: string) => {
    await window.electronAPI.pasteClipboardItem?.(text);
  };

  const activeModel = models.find((m) => m.id === selectedModel);
  const currentEmotionColor = isRecording ? getEmotionColor(liveEmotion?.label) : '#10B981';
  const currentEmotionLabel = liveEmotion?.label || 'Neutral';

  const totalLogs = history.length;
  const emotionCounts: Record<string, number> = {};
  ALL_EMOTIONS.forEach((e) => (emotionCounts[e] = 0));
  history.forEach((item) => {
    const lbl = item.emotion?.label || 'Neutral';
    emotionCounts[lbl] = (emotionCounts[lbl] || 0) + 1;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FLOATING OVERLAY VIEW (`?overlay=1`) — Wispr Flow style pill + wave bars
  // ───────────────────────────────────────────────────────────────────────────
  if (isOverlay) {
    const WAVE_BARS = 14;
    // Stable centre-weighted envelope. Previously this used Date.now(), so bars
    // drifted on every render even in silence; now the shape is fixed and only
    // the mic level drives motion.
    const waveMultipliers = Array.from({ length: WAVE_BARS }, (_, i) =>
      0.45 + 0.55 * Math.sin(((i + 0.5) / WAVE_BARS) * Math.PI),
    );
    // audio_level is min(1, rms*5); ordinary speech sits around 0.1–0.4, so the
    // old `level * 20` mapping never cleared the 4px floor. Raise it with a
    // perceptual curve so quiet speech is still clearly visible.
    const SPEAKING_THRESHOLD = 0.04;
    const isSpeaking = smoothLevel > SPEAKING_THRESHOLD;
    const barColor = isRecording || isProcessing ? currentEmotionColor : '#64748B';
    const statusLabel = isProcessing
      ? 'Processing…'
      : isRecording
        ? isLongSession
          ? 'Hands-free'
          : 'Listening…'
        : 'Ready';

    return (
      <div style={{
        width: '100vw', height: '100vh', background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        WebkitAppRegion: 'drag', userSelect: 'none', overflow: 'hidden',
        boxSizing: 'border-box', padding: '0 8px',
      } as any}>
        <style>{`
          @keyframes wispr-idle-pulse {
            0%, 100% { transform: scaleY(0.35); opacity: 0.45; }
            50% { transform: scaleY(0.75); opacity: 0.7; }
          }
          @keyframes wispr-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes aura-wave {
            0% { box-shadow: 0 0 0 0px var(--wave-color); opacity: 0.9; }
            100% { box-shadow: 0 0 0 8px var(--wave-color); opacity: 0; }
          }
        `}</style>

        {/* Capsule hugs its content — a fixed 100% width made it look stretched */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'fit-content', maxWidth: 340, height: 40, '--wave-color': currentEmotionColor } as any}>
          {isRecording && isSpeaking && (
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              border: `1px solid ${currentEmotionColor}`,
              animation: 'aura-wave 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              zIndex: 0,
              pointerEvents: 'none',
              opacity: 0.5,
            }} />
          )}

          {/* Main capsule — macOS-style vibrancy: translucent, heavily blurred,
              hairline light border, soft elevation shadow. */}
          <div style={{
            height: '100%',
            borderRadius: 999, display: 'inline-flex', alignItems: 'center',
            gap: 10, padding: '0 14px',
            background: 'rgba(28, 30, 38, 0.72)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: isRecording
              ? `0 10px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px ${currentEmotionColor}22`
              : '0 10px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            WebkitAppRegion: 'drag',
            zIndex: 1,
            transition: 'box-shadow 0.3s ease',
          } as any}>
            {/* Mic + wave bars. minWidth:0 lets this side shrink instead of
                pushing the emotion badge past the capsule's rounded edge. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, overflow: 'hidden', WebkitAppRegion: 'no-drag' } as any}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: isRecording ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.3s ease',
              }}>
                {isProcessing ? (
                  <div style={{
                    width: 11, height: 11, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.25)',
                    borderTopColor: '#FFFFFF',
                    animation: 'wispr-spin 0.8s linear infinite',
                  }} />
                ) : (
                  <IconMic size={11} color={isRecording ? '#0B0D12' : 'rgba(255,255,255,0.75)'} />
                )}
              </div>

              {/* Animated waveform */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 22 }}>
                {waveMultipliers.map((mult, i) => {
                  const REST = 3;
                  let h = REST;
                  if (isProcessing) {
                    // Gentle standing wave while transcribing — no mic input to show.
                    h = REST + 6 * mult;
                  } else if (isRecording && isSpeaking) {
                    // pow() lifts quiet speech; 0.2 -> ~0.38 instead of 0.2
                    h = REST + Math.pow(smoothLevel, 0.6) * 19 * mult;
                  }
                  const lit = isRecording || isProcessing;
                  return (
                    <div
                      key={i}
                      style={{
                        width: 2.5,
                        height: `${Math.min(22, h)}px`,
                        borderRadius: 2,
                        background: lit ? '#FFFFFF' : 'rgba(255,255,255,0.28)',
                        opacity: lit && !isSpeaking && !isProcessing ? 0.5 : 1,
                        transition: 'height 0.07s ease-out, opacity 0.2s',
                      }}
                    />
                  );
                })}
              </div>

              <span style={{
                fontSize: 11.5, fontWeight: 500, letterSpacing: '-0.01em',
                color: isRecording || isProcessing ? '#FFFFFF' : 'rgba(255,255,255,0.72)',
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
              }}>
                {statusLabel}
              </span>
            </div>

            {/* Right: emotion tag or shortcut hint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag', flexShrink: 0 } as any}>
              {isRecording && liveEmotion ? (
                <div style={{
                  padding: '3px 8px', borderRadius: 999,
                  background: `${currentEmotionColor}1f`,
                  color: currentEmotionColor, fontSize: 10, fontWeight: 600,
                  letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center', gap: 5,
                  maxWidth: 104, whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: currentEmotionColor,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentEmotionLabel}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FN KEY NATIVE-ACTION GATE
  // Blocks the dashboard until macOS's own "Press fn key to" preference is
  // verifiably set to "Do Nothing" — otherwise the system emoji picker /
  // dictation fires alongside Wisper on every fn press. Detected by reading
  // AppleFnUsageType directly (see check_fn_key_setting in main.ts), not a
  // self-reported checkbox — this re-checks every 1.5s and unlocks itself.
  // ───────────────────────────────────────────────────────────────────────────
  if (fnKeyGate === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-black" />
    );
  }

  if (fnKeyGate === 'needed') {
    const valueLabel =
      fnKeyValue === 1 ? 'Switch Input Source'
      : fnKeyValue === 2 ? 'Character Viewer (Emoji & Symbols)'
      : fnKeyValue === 3 ? 'Start Dictation'
      : fnKeyValue === null ? 'not yet set'
      : 'something other than Do Nothing';

    const steps = [
      'Click "Open Keyboard Settings" below',
      'Find "Press 🌐 fn key to" near the top of the panel',
      'Set it to "Do Nothing"',
    ];

    return (
      <div style={{
        height: '100vh', width: '100vw', background: '#090B0E',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
        WebkitAppRegion: 'drag',
      } as any}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <IconLogo size={36} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.3px' }}>
            Wisper Emotion
          </span>
        </div>

        <div style={{
          width: 460, background: '#121520', border: '1px solid #22283A',
          borderRadius: 14, padding: '32px', WebkitAppRegion: 'no-drag',
        } as any}>

          <div style={{ marginBottom: 22, textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: '#241C0E', border: '1px solid #F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <IconGear size={24} color="#F59E0B" style={{ animation: 'spin 4s linear infinite' }} />
            </div>
            <h2 className="text-[17px] font-bold text-neutral-100 mb-1.5">
              Free Up the <code className="kbd">fn</code> Key
            </h2>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.55 }}>
              macOS is currently set to <strong style={{ color: '#F1F5F9' }}>{valueLabel}</strong> when{' '}
              <code className="kbd">fn</code> is pressed, so it would fire alongside Wisper on every press.
              Set it to <strong style={{ color: '#F1F5F9' }}>Do Nothing</strong> so Wisper is the only thing that responds.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 9,
                background: '#0D1017', border: '1px solid #1E2536',
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: '#1A2130', border: '1px solid #2B374E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace',
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, color: '#CBD5E1' }}>{step}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleOpenKeyboardSettings}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 8,
              background: '#0EA5E9', color: '#FFF', border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginBottom: 14,
            }}
          >
            <IconGear size={14} />
            Open Keyboard Settings
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontSize: 11, color: '#64748B',
          }}>
            <IconSpinner size={11} color="#64748B" style={{ animation: 'spin 1s linear infinite' }} />
            <span>Watching for the change — this screen unlocks automatically</span>
          </div>
        </div>

        <p style={{ fontSize: 11, color: '#475569', marginTop: 16, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          If <code className="kbd">fn</code> still opens the emoji picker right after changing this, restart your Mac to finish applying it.
        </p>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FIRST-LAUNCH SETUP GATE
  // ───────────────────────────────────────────────────────────────────────────
  if (firstLaunchGate === 'checking') {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-black" />
    );
  }

  if (firstLaunchGate === 'needed') {
    const isDone = setupPhase === 'done';
    const isDownloading = setupPhase === 'downloading';
    const isError = setupPhase === 'error';
    const isWaiting = setupPhase === 'waiting';

    return (
      <div style={{
        height: '100vh', width: '100vw', background: '#09090B',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
        WebkitAppRegion: 'drag',
      } as any}>
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 9 }}>
          <IconLogo size={20} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#A1A1AA', letterSpacing: '-0.01em' }}>
            Wisper
          </span>
        </div>

        <style>{`
          @keyframes setup-indeterminate {
            0%   { left: -30%; }
            100% { left: 100%; }
          }
        `}</style>

        <div style={{
          width: 360, background: '#0F0F11', border: '1px solid #1F1F23',
          borderRadius: 10, padding: '24px 24px 22px', WebkitAppRegion: 'no-drag',
        } as any}>

          <div style={{ marginBottom: 22 }}>
            <h2 style={{
              fontSize: 15, fontWeight: 600, color: '#F4F4F5',
              letterSpacing: '-0.01em', margin: '0 0 6px',
            }}>
              {isDone ? 'Ready' : isError ? 'Download failed' : 'Setting up'}
            </h2>
            <p style={{ fontSize: 12.5, color: '#8B8B93', lineHeight: 1.5, margin: 0 }}>
              {isDone
                ? 'Opening Wisper.'
                : isError
                  ? (setupError || 'Check your connection and try again.')
                  : 'Downloading the speech model. This happens once — afterwards Wisper works offline.'}
            </p>
          </div>

          {!isError && (
            <div>
              <div style={{
                height: 3, background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden', position: 'relative',
              }}>
                {isWaiting || (isDownloading && setupPercent === 0) ? (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, width: '30%',
                    background: 'rgba(255,255,255,0.5)',
                    animation: 'setup-indeterminate 1.4s ease-in-out infinite',
                  }} />
                ) : (
                  <div style={{
                    height: '100%',
                    width: `${setupPercent}%`,
                    background: '#F4F4F5',
                    transition: 'width 0.4s linear',
                  }} />
                )}
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginTop: 10,
              }}>
                <span style={{ fontSize: 11.5, color: '#8B8B93' }}>
                  {isDone ? 'Complete' : isDownloading && setupPercent > 0 ? 'Downloading' : 'Starting'}
                </span>
                <span style={{
                  fontSize: 11.5, color: '#8B8B93',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {setupPercent > 0 ? `${setupPercent}%` : '142 MB'}
                </span>
              </div>
            </div>
          )}

          {isError && (
            <button
              onClick={handleRetrySetup}
              style={{
                padding: '7px 14px', borderRadius: 7,
                background: '#F4F4F5', color: '#09090B', border: 'none',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. MAIN APPLICATION CONSOLE
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#090A0D', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        :root {
          --bg-main: #090A0D;
          --bg-sidebar: #11141D;
          --bg-card: #121520;
          --border-color: #22283A;
          --text-main: #F1F5F9;
          --text-sub: #94A3B8;
        }

        body, html {
          margin: 0; padding: 0; background: #090A0D; color: #F1F5F9; overflow: hidden;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }

        .sidebar {
          width: 210px; background: #11141D; border-right: 1px solid #22283A;
          display: flex; flex-direction: column; justify-content: space-between;
          padding: 18px 12px; flex-shrink: 0; -webkit-app-region: drag; user-select: none;
        }

        .sidebar-header {
          display: flex; alignItems: center; gap: 10px; padding-bottom: 16px;
          border-bottom: 1px solid #1E2332; margin-bottom: 14px;
        }

        .brand-icon-box {
          width: 32px; height: 32px; border-radius: 8px; background: #181D2A;
          border: 1px solid #273046; display: flex; alignItems: center; justifyContent: center;
        }

        .brand-title {
          font-size: 14px; font-weight: 700; color: #F1F5F9; letter-spacing: -0.2px;
        }

        .brand-subtitle {
          font-size: 11px; color: #64748B;
        }

        .sidebar-nav {
          display: flex; flex-direction: column; gap: 4px; -webkit-app-region: no-drag;
        }

        .nav-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px; border-radius: 8px; background: transparent;
          border: 1px solid transparent; color: #94A3B8; font-size: 12px;
          font-weight: 500; cursor: pointer; transition: all 0.15s ease;
        }

        .nav-item:hover {
          background: #161B27; color: #F1F5F9;
        }

        .nav-item.active {
          background: #1A2130; border-color: #2B374E; color: #10B981;
        }

        .nav-left {
          display: flex; align-items: center; gap: 9px;
        }

        .nav-tag {
          font-size: 10px; padding: 2px 6px; border-radius: 4px;
          background: #1C2333; color: #94A3B8; font-weight: 600;
        }

        .sidebar-footer {
          padding-top: 14px; border-top: 1px solid #1E2332; -webkit-app-region: no-drag;
        }

        .footer-title {
          font-size: 10px; font-weight: 600; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
        }

        .keybind-row {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: #94A3B8; margin-bottom: 6px;
        }

        .kbd {
          font-family: monospace; background: #1C2333; border: 1px solid #2B374E;
          border-radius: 4px; padding: 2px 5px; font-size: 10px; color: #E2E8F0;
        }

        .main-content {
          flex: 1; overflow-y: auto; padding: 24px 32px; background: #090A0D;
        }

        .page-header {
          display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;
        }

        .page-title {
          font-size: 20px; font-weight: 700; color: #F1F5F9; margin: 0 0 4px 0; letter-spacing: -0.3px;
        }

        .page-subtitle {
          font-size: 12px; color: #94A3B8; margin: 0;
        }

        .badge {
          display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
          border-radius: 6px; background: #131722; border: 1px solid #22293C;
          font-size: 11px; font-weight: 500; color: #94A3B8;
        }

        .card-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 14px; margin-bottom: 20px;
        }

        .card {
          background: #121520; border: 1px solid #22283A; border-radius: 12px;
          padding: 18px; display: flex; flex-direction: column; gap: 12px;
        }

        .card-title-row {
          display: flex; align-items: center; justify-content: space-between;
        }

        .card-title {
          font-size: 13px; font-weight: 600; color: #F1F5F9;
        }

        .recording-btn {
          width: 100%; padding: 12px; border-radius: 8px; background: #171B2B;
          border: 1px solid #283146; color: #F1F5F9; font-size: 12px;
          font-weight: 600; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 8px; transition: all 0.15s ease;
        }

        .recording-btn:hover {
          background: #1F263C; border-color: #384666;
        }

        .recording-btn.active {
          background: #0B251D; border-color: #10B981; color: #10B981;
        }

        .dot-indicator {
          width: 7px; height: 7px; border-radius: 50%; background: #64748B;
        }

        .dot-indicator.active {
          background: #10B981; animation: pulse-dot 1.5s infinite;
        }

        .history-list {
          display: flex; flex-direction: column; gap: 10px;
        }

        .history-card {
          background: #121520; border: 1px solid #22283A; border-radius: 10px;
          padding: 14px; display: flex; flex-direction: column; gap: 8px;
        }

        .history-meta {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 11px; color: #64748B;
        }

        .history-text {
          font-size: 13px; color: #F1F5F9; margin: 0; line-height: 1.5;
        }

        .select-btn {
          padding: 5px 10px; border-radius: 6px; background: #171B2B;
          border: 1px solid #273046; color: #94A3B8; font-size: 11px;
          font-weight: 500; cursor: pointer; transition: all 0.15s ease;
        }

        .select-btn:hover {
          background: #20273D; color: #F1F5F9;
        }

        .select-btn.active {
          background: #0EA5E922; border-color: #0EA5E9; color: #0EA5E9;
        }

        .model-table {
          width: 100%; border-collapse: separate; border-spacing: 0;
          background: #121520; border: 1px solid #22283A; border-radius: 12px; overflow: hidden;
        }

        .model-table th {
          background: #161A28; padding: 12px 16px; text-align: left;
          font-size: 11px; font-weight: 600; color: #94A3B8; border-bottom: 1px solid #22283A;
        }

        .model-table td {
          padding: 14px 16px; font-size: 12px; color: #E2E8F0; border-bottom: 1px solid #1C2130;
        }

        .model-table tr:last-child td {
          border-bottom: none;
        }
      `}</style>

      {/* Sidebar Navigation */}
      <aside className="w-[228px] shrink-0 bg-[#0A0A0A] border-r border-neutral-900 flex flex-col p-[36px_12px_18px] gap-2.5 z-10">
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2.5 px-2 pb-4 mb-1.5 border-b border-neutral-900/50">
            <IconLogo size={26} />
            <div>
              <div className="text-sm font-bold tracking-tight text-neutral-200 leading-tight">Wisper Emotion</div>
              <div className="text-[10px] text-neutral-500 font-normal mt-[1px]">Voice &amp; Emotion Engine</div>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5 flex-1">
            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'dictate' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('dictate')}>
              <div className="flex items-center gap-2.5">
                <IconMic size={15} color={isRecording ? currentEmotionColor : undefined} />
                <span>Dictation</span>
              </div>
              {isRecording && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900/50 text-neutral-500 flex items-center gap-1" style={{ color: currentEmotionColor, backgroundColor: `${currentEmotionColor}22` }}>
                  {liveEmotion?.label || 'Live'}
                </span>
              )}
            </button>

            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'models' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('models')}>
              <div className="flex items-center gap-2.5">
                <IconCpu size={15} />
                <span>Accuracy</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900/50 text-neutral-500 flex items-center gap-1">
                {models.filter((m) => m.downloaded).length}/{models.length}
              </span>
            </button>

            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'emotions' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('emotions')}>
              <div className="flex items-center gap-2.5">
                <IconHeart size={15} color={isRecording ? currentEmotionColor : undefined} />
                <span>Tone</span>
              </div>
            </button>

            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'clipboard' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('clipboard')}>
              <div className="flex items-center gap-2.5">
                <IconClipboard size={15} />
                <span>Clipboard</span>
              </div>
              {clipboardHistory.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900/50 text-neutral-500 flex items-center gap-1">{clipboardHistory.length}</span>}
            </button>

            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'dictionary' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('dictionary')}>
              <div className="flex items-center gap-2.5">
                <IconStar size={15} />
                <span>Dictionary</span>
              </div>
              {dictionary.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-900/50 text-neutral-500 flex items-center gap-1">{dictionary.length}</span>}
            </button>

            <button className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 w-full text-left border ${activeTab === 'settings' ? 'bg-neutral-900/50 text-neutral-200 border-neutral-800/50' : 'bg-transparent text-neutral-400 border-transparent hover:bg-white/5 hover:text-neutral-200'}`} onClick={() => setActiveTab('settings')}>
              <div className="flex items-center gap-2.5">
                <IconGear size={15} />
                <span>Settings</span>
              </div>
            </button>
          </nav>
        </div>

        <div className="p-3.5 bg-[#0A0A0A] border border-neutral-900/50 rounded-xl flex flex-col gap-2.5">
          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Shortcuts</div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Hold to Speak</span>
            <span className="kbd">fn</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Hands-free</span>
            <span className="kbd">fn + Space</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Paste last</span>
            <span className="kbd">⌘V</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span>Toggle Backup</span>
            <span className="kbd">⌘ ⌥ Space</span>
          </div>
        </div>
      </aside>

      {/* Main Console View */}
      <main className="flex-1 flex flex-col overflow-y-auto p-[26px_32px]">
        {updateInfo && (
          <div style={{
            marginBottom: 16, padding: '14px 18px', borderRadius: 10,
            background: '#121927', border: '1px solid #0EA5E9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 4 }}>
                Update available — v{updateInfo.version}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>
                {updateInfo.notes || 'A newer version of Wispr Flow is available.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="select-btn active"
                onClick={() => window.electronAPI?.openExternalLink?.(updateInfo.downloadUrl)}
              >
                Download
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-200 text-[11px] font-medium cursor-pointer transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-white/5" onClick={() => setUpdateInfo(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!microphoneGranted && (
          <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5" style={{ marginBottom: 16, borderColor: '#7C3AED44', backgroundColor: '#1A1428' }}>
            <div className="flex items-center justify-between gap-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconMic size={16} color="#A78BFA" />
                <span className="card-title" style={{ color: '#A78BFA' }}>
                  Microphone Permission Required
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Wisper can't hear you yet. Turn on microphone access for Wisper.
            </p>
            <div>
              <button className="select-btn active" onClick={handleRequestMicrophone}>
                Grant Microphone Access
              </button>
            </div>
          </div>
        )}

        {!accessibilityGranted && (
          <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5" style={{ marginBottom: 16, borderColor: '#3A4560', backgroundColor: '#141A28' }}>
            <div className="flex items-center justify-between gap-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconShield size={16} color="#0EA5E9" />
                <span className="card-title" style={{ color: '#0EA5E9' }}>
                  One more permission needed
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Wisper needs Accessibility access to type for you. Until then your words are
              copied — paste with <code className="kbd">⌘ V</code>.
            </p>
            <div>
              <button className="select-btn active" onClick={handleRequestAccessibility}>
                Open Settings
              </button>
            </div>
          </div>
        )}

        {/* "No Cursor Location" Minimal Pop Toast Notification */}
        {showNoCursorPop && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 10,
            background: '#121927', border: '1px solid #0EA5E9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconTarget size={16} color="#0EA5E9" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#F1F5F9' }}>
                  Cursor position not in active input field
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  Text was copied to clipboard. Press Shift+C or click below to copy again.
                </div>
              </div>
            </div>
            <button className="select-btn active" onClick={handleCopyNoCursorText} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconCopy size={12} />
              <span>Copy Last Text</span>
            </button>
          </div>
        )}

        {/* ── DICTATION TAB ── */}
        {activeTab === 'dictate' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Voice Dictation</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Real-time emotion-aware speech-to-text system</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 whitespace-nowrap" style={{ borderColor: isRecording ? `${currentEmotionColor}66` : undefined, color: isRecording ? currentEmotionColor : '#94A3B8' }}>
                <div className={`dot-indicator ${isRecording ? 'active' : ''}`} style={{ backgroundColor: isRecording ? currentEmotionColor : undefined }} />
                {isRecording ? `Recording (${currentEmotionLabel})` : 'Engine Ready'}
              </span>
            </div>

            {/* One-line hint until they've dictated once, then it disappears. */}
            {history.length === 0 && (
              <p style={{ fontSize: 12.5, color: '#64748B', margin: '0 0 16px' }}>
                Click where you want the text, hold <code className="kbd">fn</code>, and speak.
              </p>
            )}

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-6">
              <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5" style={{ borderColor: isRecording ? `${currentEmotionColor}66` : undefined }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Dictate</span>
                  {isRecording && liveEmotion && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 whitespace-nowrap" style={{ color: currentEmotionColor, borderColor: `${currentEmotionColor}44` }}>
                      <EmotionIcon label={liveEmotion.label} size={12} />
                      {liveEmotion.label} ({Math.round(liveEmotion.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <button
                  className={`flex items-center justify-center gap-2.5 p-[14px_20px] rounded-xl text-[13px] font-semibold cursor-pointer transition-all duration-150 w-full border ${isRecording ? 'bg-emerald-500/10 border-emerald-500 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.25)]' : 'bg-[#0A0A0A] border-neutral-800 text-neutral-200 hover:bg-white/5 hover:border-neutral-700'}`}
                  onMouseDown={(e) => { e.preventDefault(); handleRecordStart(); }}
                  onMouseUp={handleRecordStop}
                  onTouchStart={(e) => { e.preventDefault(); handleRecordStart(); }}
                  onTouchEnd={handleRecordStop}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ userSelect: 'none', touchAction: 'none' }}
                >
                  <div className={`dot-indicator ${isRecording ? 'active' : ''}`} style={{ backgroundColor: isRecording ? currentEmotionColor : undefined }} />
                  <IconMic size={16} color={isRecording ? currentEmotionColor : '#10B981'} />
                  <span>
                    {isRecording
                      ? 'Release to transcribe…'
                      : 'Hold button to speak'}
                  </span>
                </button>
                {pipelineError && (
                  <p style={{ fontSize: 11, color: '#F87171', margin: 0 }}>
                    {pipelineError}
                  </p>
                )}
              </div>

              <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Latest Transcript</span>
                </div>
                <p style={{ fontSize: 14, color: lastTranscript ? '#F1F5F9' : '#64748B', margin: 0, lineHeight: 1.5, minHeight: 40 }}>
                  {partialText || lastTranscript || (isRecording ? 'Listening…' : 'Your words will appear here.')}
                </p>
              </div>

              <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Accuracy</span>
                  <button
                    onClick={() => setActiveTab('models')}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: '#64748B', textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    Change
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>
                    {(activeModel && FRIENDLY_MODELS[activeModel.id]?.title) || 'Everyday'}
                  </span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>
                    {(activeModel && FRIENDLY_MODELS[activeModel.id]?.bestFor) || 'Good balance of speed and accuracy'}
                  </span>
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', marginBottom: 12 }}>
              Transcripts History
            </h2>

            {history.length === 0 ? (
              <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5" style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>
                <p style={{ margin: 0 }}>No dictation history yet. Hold <span className="kbd">fn</span> anywhere to begin speaking.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((item) => {
                  const emoColor = getEmotionColor(item.emotion?.label);
                  return (
                    <div key={item.id} className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-[16px_18px] flex flex-col gap-2.5 shadow-sm" style={{ borderLeft: `3px solid ${emoColor}` }}>
                      <div className="flex items-center justify-between text-[11px] text-neutral-500 gap-2">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{item.timestamp}</span>
                          {item.emotion?.label && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 whitespace-nowrap" style={{ color: emoColor, borderColor: `${emoColor}40` }}>
                              <EmotionIcon label={item.emotion.label} size={11} />
                              {item.emotion.label} ({Math.round((item.emotion.confidence || 0.9) * 100)}%)
                            </span>
                          )}
                        </div>
                        <button onClick={() => handleCopyText(item.id, item.text)} className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-200 text-[11px] font-medium cursor-pointer transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-white/5" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {copiedId === item.id ? <IconCheck size={12} /> : <IconCopy size={12} />}
                          <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="text-[13px] leading-relaxed text-neutral-200">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MODELS TAB ── */}
        {activeTab === 'models' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Accuracy</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Faster responds quicker, slower understands more
                </p>
                {modelError && (
                  <p style={{ fontSize: 11.5, color: '#F87171', marginTop: 8 }}>{modelError}</p>
                )}
              </div>
            </div>

            <table className="w-full border-collapse border border-neutral-900 rounded-xl overflow-hidden bg-[#0A0A0A]">
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Best for</th>
                  <th>Download size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const dl = downloadState[m.id];
                  const isDownloading = dl?.active === true;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
                          {FRIENDLY_MODELS[m.id]?.title ?? m.name}
                          {m.id === 'base.en' && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#10B981', background: '#10B9811f', padding: '2px 6px', borderRadius: 999 }}>
                              Recommended
                            </span>
                          )}
                          {isDownloading && (
                            <span style={{ fontSize: 10, color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <IconSpinner size={10} style={{ animation: 'spin 1s linear infinite' }} />
                              {dl.percent}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 11.5, color: '#94A3B8' }}>
                        {FRIENDLY_MODELS[m.id]?.bestFor ?? m.description}
                      </td>
                      <td>
                        <span style={{ fontSize: 11.5, color: m.downloaded ? '#10B981' : '#94A3B8' }}>
                          {m.downloaded ? 'On your Mac' : m.weightSize}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!m.downloaded && !isDownloading && (
                            <button onClick={() => handleDownload(m)} className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-200 text-[11px] font-medium cursor-pointer transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-white/5" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <IconDownload size={12} />
                              <span>Download</span>
                            </button>
                          )}
                          {m.downloaded && (
                            <button onClick={() => handleSelectModel(m)} className={`select-btn ${selectedModel === m.id ? 'active' : ''}`}>
                              {selectedModel === m.id ? 'Active' : 'Select'}
                            </button>
                          )}
                          {m.downloaded && (
                            confirmDeleteId === m.id ? (
                              <>
                                <button
                                  onClick={() => handleDeleteModel(m)}
                                  className="px-3 py-1.5 rounded-md text-[11px] font-medium cursor-pointer whitespace-nowrap"
                                  style={{ background: '#7F1D1D', border: '1px solid #991B1B', color: '#FEE2E2' }}
                                >
                                  Delete {m.weightSize}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-400 text-[11px] font-medium cursor-pointer whitespace-nowrap hover:bg-white/5"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => { setConfirmDeleteId(m.id); setModelError(null); }}
                                title="Remove from this Mac to free up space"
                                className="px-2 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-500 text-[11px] font-medium cursor-pointer whitespace-nowrap hover:bg-white/5 hover:text-neutral-300"
                                style={{ display: 'flex', alignItems: 'center' }}
                              >
                                <IconTrash size={12} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── EMOTIONS TAB ── */}
        {activeTab === 'emotions' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Tone &amp; Emotion Analysis</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Acoustic tone classification and history</p>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 mb-6">
              {ALL_EMOTIONS.map((emo) => {
                const count = emotionCounts[emo] || 0;
                const color = getEmotionColor(emo);
                return (
                  <div key={emo} className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <EmotionIcon label={emo} size={16} color={color} />
                        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{emo}</span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800 whitespace-nowrap" style={{ color }}>{count} logs</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CLIPBOARD TAB ── */}
        {activeTab === 'clipboard' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Clipboard History</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Every dictation is saved here and left on the clipboard for ⌘V</p>
              </div>
              {clipboardHistory.length > 0 && (
                <button className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-200 text-[11px] font-medium cursor-pointer transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-white/5" onClick={handleClearClipboard} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconTrash size={12} />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search history..."
                value={clipboardSearch}
                onChange={(e) => setClipboardSearch(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  background: '#121520', border: '1px solid #22283A',
                  color: '#F1F5F9', fontSize: 12, outline: 'none',
                }}
              />
            </div>

            <div className="flex flex-col gap-3">
              {clipboardHistory
                .filter((item) => item.text.toLowerCase().includes(clipboardSearch.toLowerCase()))
                .map((item) => (
                  <div key={item.id} className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-[16px_18px] flex flex-col gap-2.5 shadow-sm">
                    <div className="flex items-center justify-between text-[11px] text-neutral-500 gap-2">
                      <span>{item.timestamp}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleCopyText(item.id, item.text)} className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-200 text-[11px] font-medium cursor-pointer transition-all duration-150 inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-white/5">
                          Copy
                        </button>
                        <button onClick={() => handlePasteClipboard(item.text)} className="select-btn active">
                          Paste
                        </button>
                      </div>
                    </div>
                    <p className="text-[13px] leading-relaxed text-neutral-200">{item.text}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Settings</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">Configure system triggers and options</p>
              </div>
            </div>

            <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-3.5">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Shift + C Quick Paste</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>Global shortcut to paste last transcribed voice text.</div>
                </div>
                <button className={`select-btn ${shiftCPasteEnabled ? 'active' : ''}`} onClick={() => handleToggleShiftC(!shiftCPasteEnabled)}>
                  {shiftCPasteEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'dictionary' && (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-neutral-200 tracking-tight leading-tight">Dictionary</h1>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                  Names and terms Wisper should spell correctly
                </p>
              </div>
              {dictSaved && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <IconCheck size={12} color="#10B981" /> Saved
                </span>
              )}
            </div>

            <div className="bg-[#0A0A0A] border border-neutral-900 rounded-xl p-5 flex flex-col gap-4">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={dictWord}
                  onChange={(e) => setDictWord(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictionaryEntry(); }}
                  placeholder="Add a word…  e.g. GitHub, Kubernetes, Priya"
                  style={{
                    flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 8,
                    background: '#0D1017', border: '1px solid #1E2536',
                    color: '#F1F5F9', fontSize: 12.5, outline: 'none',
                  }}
                />
                <button
                  className="select-btn active"
                  onClick={handleAddDictionaryEntry}
                  disabled={!dictWord.trim()}
                  style={{ flexShrink: 0, opacity: !dictWord.trim() ? 0.45 : 1 }}
                >
                  Add
                </button>
              </div>

              {/* Fallback for the rare word the model still refuses to get right */}
              {dictShowFallback ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={dictHeardAs}
                    onChange={(e) => setDictHeardAs(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddDictionaryEntry(); }}
                    placeholder="If it still gets it wrong, what does it write?  e.g. get hub"
                    style={{
                      flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 8,
                      background: '#0D1017', border: '1px solid #1E2536',
                      color: '#F1F5F9', fontSize: 12, outline: 'none',
                    }}
                  />
                  <button
                    className="px-3 py-1.5 rounded-md bg-[#0A0A0A] border border-neutral-800 text-neutral-400 text-[11px] font-medium cursor-pointer hover:bg-white/5"
                    onClick={() => { setDictShowFallback(false); setDictHeardAs(''); }}
                    style={{ flexShrink: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDictShowFallback(true)}
                  style={{
                    alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
                    color: '#64748B', fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  Add a correction
                </button>
              )}

              {dictionary.length === 0 ? (
                <div style={{
                  fontSize: 11, color: '#64748B', textAlign: 'center',
                  padding: '14px 0', border: '1px dashed #1E2536', borderRadius: 8,
                }}>
                  No words yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dictionary.map((entry) => (
                    <div
                      key={entry.word}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 11px', borderRadius: 8,
                        background: '#0D1017', border: '1px solid #1E2536',
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: '#F1F5F9', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.word}
                      </span>
                      {entry.heardAs && (
                        <span style={{ fontSize: 11, color: '#64748B', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          also fixes “{entry.heardAs}”
                        </span>
                      )}
                      <span style={{ flex: 1 }} />
                      <button
                        onClick={() => handleRemoveDictionaryEntry(entry.word)}
                        title="Remove"
                        style={{
                          flexShrink: 0, background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6,
                        }}
                      >
                        <IconTrash size={13} color="#64748B" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {dictionary.length > 12 && (
                <div style={{ fontSize: 10.5, color: '#475569' }}>
                  Long lists reduce accuracy. Keep only words you actually use.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
