import React, { useState, useEffect, useRef } from 'react';
import {
  IconMic,
  IconCpu,
  IconHeart,
  IconGear,
  IconWaves,
  IconCopy,
  IconCheck,
  IconDownload,
  IconSpinner,
  IconShield,
  IconActivity,
  IconBolt,
  IconFire,
  IconFace,
  IconTarget,
  IconLeaf,
  IconMoon,
  IconStar,
  IconClipboard,
  IconTrash,
} from './icons';

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

  const [activeTab, setActiveTab] = useState<'dictate' | 'models' | 'emotions' | 'settings' | 'clipboard'>(
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
    return () => clearInterval(interval);
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
    const waveMultipliers = Array.from({ length: WAVE_BARS }, (_, i) =>
      0.35 + 0.65 * Math.abs(Math.sin((i / WAVE_BARS) * Math.PI * 2.5 + Date.now() * 0.003)),
    );
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
        WebkitAppRegion: 'drag' as any, userSelect: 'none', overflow: 'hidden',
        boxSizing: 'border-box', padding: '0 8px',
      }}>
        <style>{`
          @keyframes wispr-idle-pulse {
            0%, 100% { transform: scaleY(0.35); opacity: 0.45; }
            50% { transform: scaleY(0.75); opacity: 0.7; }
          }
          @keyframes wispr-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>

        <div style={{
          width: '100%', maxWidth: 340, height: 56,
          borderRadius: 999, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 16px',
          background: 'rgba(10, 12, 16, 0.88)',
          border: `1px solid ${isRecording ? `${currentEmotionColor}55` : '#2A3144'}`,
          boxShadow: isRecording
            ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${currentEmotionColor}22`
            : '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          WebkitAppRegion: 'drag' as any,
        }}>
          {/* Mic + wave bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, WebkitAppRegion: 'no-drag' as any }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: isRecording ? `${currentEmotionColor}22` : '#1A2132',
              border: `1px solid ${isRecording ? currentEmotionColor : '#2D374E'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isProcessing ? (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${currentEmotionColor}44`,
                  borderTopColor: currentEmotionColor,
                  animation: 'wispr-spin 0.8s linear infinite',
                }} />
              ) : (
                <IconMic size={14} color={isRecording ? currentEmotionColor : '#94A3B8'} />
              )}
            </div>

            {/* Animated waveform */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 28 }}>
              {waveMultipliers.map((mult, i) => {
                const active = isRecording || isProcessing;
                const h = active
                  ? Math.max(4, Math.min(26, smoothLevel * 28 * mult + (isProcessing ? 6 : 0)))
                  : 6;
                return (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      height: `${h}px`,
                      borderRadius: 2,
                      background: active ? barColor : '#3A4560',
                      transformOrigin: 'center bottom',
                      transition: active ? 'height 0.06s ease-out, background 0.2s' : 'none',
                      animation: !active ? `wispr-idle-pulse 1.4s ease-in-out ${i * 0.08}s infinite` : 'none',
                    }}
                  />
                );
              })}
            </div>

            <span style={{
              fontSize: 12, fontWeight: 600, color: isRecording ? '#F1F5F9' : '#94A3B8',
              whiteSpace: 'nowrap', marginLeft: 2,
            }}>
              {statusLabel}
            </span>
          </div>

          {/* Right: emotion tag or shortcut hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' as any, flexShrink: 0 }}>
            {isRecording && liveEmotion ? (
              <div style={{
                padding: '3px 9px', borderRadius: 6,
                background: '#131824', border: `1px solid ${currentEmotionColor}44`,
                color: currentEmotionColor, fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <EmotionIcon label={liveEmotion.label} size={10} color={currentEmotionColor} />
                <span>{currentEmotionLabel}</span>
              </div>
            ) : (
              <span style={{
                fontSize: 10, color: accessibilityGranted ? '#64748B' : '#F59E0B',
                fontFamily: 'monospace',
              }} title={accessibilityGranted ? 'Hold Fn to dictate' : 'Use Cmd+Option+Space'}
              >
                {accessibilityGranted ? (isLongSession ? 'fn tap' : 'fn') : '⌘⌥␣'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FIRST-LAUNCH SETUP GATE
  // ───────────────────────────────────────────────────────────────────────────
  if (firstLaunchGate === 'checking') {
    return (
      <div style={{
        height: '100vh', width: '100vw', background: '#090B0E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} />
    );
  }

  if (firstLaunchGate === 'needed') {
    const isDone = setupPhase === 'done';
    const isDownloading = setupPhase === 'downloading';
    const isError = setupPhase === 'error';
    const isWaiting = setupPhase === 'waiting';

    return (
      <div style={{
        height: '100vh', width: '100vw', background: '#090B0E',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif',
        WebkitAppRegion: 'drag' as any,
      }}>
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#131620', border: '1px solid #22283A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconWaves size={20} color="#10B981" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.3px' }}>
            Wispr Flow Desktop
          </span>
        </div>

        <div style={{
          width: 420, background: '#121520', border: '1px solid #22283A',
          borderRadius: 14, padding: '32px', WebkitAppRegion: 'no-drag' as any,
        }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: isDone ? '#064E3B' : isError ? '#2D1616' : '#1A2336',
              border: `1px solid ${isDone ? '#10B981' : isError ? '#642828' : '#0EA5E9'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              {isDone
                ? <IconCheck size={24} color="#10B981" />
                : isError
                  ? <IconShield size={24} color="#64748B" />
                  : <IconDownload size={24} color="#0EA5E9" style={isDownloading || isWaiting ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}} />
              }
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>
              {isDone ? 'Engine Ready' : isError ? 'Download Interrupted' : 'Initializing Speech Engine'}
            </h2>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.55 }}>
              {isDone
                ? 'Whisper Base is ready. Launching dictation console…'
                : isError
                  ? (setupError || 'Unable to download Whisper model. Please check network.')
                  : 'Downloading default speech model (Whisper Base — 142 MB). Runs 100% locally.'}
            </p>
          </div>

          {!isError && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {isDone ? 'Completed' : isDownloading ? 'Downloading…' : 'Preparing…'}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: isDone ? '#10B981' : '#0EA5E9' }}>
                  {setupPercent}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: '#1A2132', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${setupPercent}%`,
                  background: isDone ? '#10B981' : '#0EA5E9',
                  borderRadius: 999, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {isError && (
            <button
              onClick={handleRetrySetup}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                background: '#0EA5E9', color: '#FFF', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <IconDownload size={14} />
              Retry Download
            </button>
          )}
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MAIN APPLICATION CONSOLE
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
      <aside className="sidebar">
        <div>
          <div className="sidebar-header">
            <div className="brand-icon-box" style={{ borderColor: isRecording ? currentEmotionColor : undefined }}>
              <IconWaves size={16} color={isRecording ? currentEmotionColor : '#10B981'} />
            </div>
            <div>
              <div className="brand-title">Wispr Flow</div>
              <div className="brand-subtitle">Voice &amp; Emotion Engine</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <button className={`nav-item ${activeTab === 'dictate' ? 'active' : ''}`} onClick={() => setActiveTab('dictate')}>
              <div className="nav-left">
                <IconMic size={15} color={isRecording ? currentEmotionColor : undefined} />
                <span>Dictation</span>
              </div>
              {isRecording && (
                <span className="nav-tag" style={{ color: currentEmotionColor, backgroundColor: `${currentEmotionColor}22` }}>
                  {liveEmotion?.label || 'Live'}
                </span>
              )}
            </button>

            <button className={`nav-item ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>
              <div className="nav-left">
                <IconCpu size={15} />
                <span>Models</span>
              </div>
              <span className="nav-tag">
                {models.filter((m) => m.downloaded).length}/{models.length}
              </span>
            </button>

            <button className={`nav-item ${activeTab === 'emotions' ? 'active' : ''}`} onClick={() => setActiveTab('emotions')}>
              <div className="nav-left">
                <IconHeart size={15} color={isRecording ? currentEmotionColor : undefined} />
                <span>Emotions</span>
              </div>
            </button>

            <button className={`nav-item ${activeTab === 'clipboard' ? 'active' : ''}`} onClick={() => setActiveTab('clipboard')}>
              <div className="nav-left">
                <IconClipboard size={15} />
                <span>Clipboard</span>
              </div>
              {clipboardHistory.length > 0 && <span className="nav-tag">{clipboardHistory.length}</span>}
            </button>

            <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
              <div className="nav-left">
                <IconGear size={15} />
                <span>Settings</span>
              </div>
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="footer-title">Shortcuts</div>
          <div className="keybind-row">
            <span>Hold to Speak</span>
            <span className="kbd">fn</span>
          </div>
          <div className="keybind-row">
            <span>Hands-free</span>
            <span className="kbd">fn + Space</span>
          </div>
          <div className="keybind-row">
            <span>Paste last</span>
            <span className="kbd">⌘V</span>
          </div>
          <div className="keybind-row">
            <span>Toggle Backup</span>
            <span className="kbd">⌘ ⌥ Space</span>
          </div>
        </div>
      </aside>

      {/* Main Console View */}
      <main className="main-content">
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
              <button className="select-btn" onClick={() => setUpdateInfo(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!microphoneGranted && (
          <div className="card" style={{ marginBottom: 16, borderColor: '#7C3AED44', backgroundColor: '#1A1428' }}>
            <div className="card-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconMic size={16} color="#A78BFA" />
                <span className="card-title" style={{ color: '#A78BFA' }}>
                  Microphone Permission Required
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Without microphone access, recording captures silence and Whisper returns wrong text.
              Enable <strong>Electron</strong> in System Settings → Privacy & Security → Microphone.
            </p>
            <div>
              <button className="select-btn active" onClick={handleRequestMicrophone}>
                Grant Microphone Access
              </button>
            </div>
          </div>
        )}

        {!accessibilityGranted && (
          <div className="card" style={{ marginBottom: 16, borderColor: '#3A4560', backgroundColor: '#141A28' }}>
            <div className="card-title-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconShield size={16} color="#0EA5E9" />
                <span className="card-title" style={{ color: '#0EA5E9' }}>
                  macOS Accessibility Permission Required
                </span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              For <code className="kbd">fn</code> hotkeys, enable <strong>Electron</strong> (not Cursor) under System Settings → Privacy & Security → Accessibility.
              Backup shortcut: <code className="kbd">⌘ ⌥ Space</code>. Or use the hold button below — no permission needed.
            </p>
            <div>
              <button className="select-btn active" onClick={handleRequestAccessibility}>
                Grant Permission
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
            <div className="page-header">
              <div>
                <h1 className="page-title">Voice Dictation</h1>
                <p className="page-subtitle">Real-time emotion-aware speech-to-text system</p>
              </div>
              <span className="badge" style={{ borderColor: isRecording ? `${currentEmotionColor}66` : undefined, color: isRecording ? currentEmotionColor : '#94A3B8' }}>
                <div className={`dot-indicator ${isRecording ? 'active' : ''}`} style={{ backgroundColor: isRecording ? currentEmotionColor : undefined }} />
                {isRecording ? `Recording (${currentEmotionLabel})` : 'Engine Ready'}
              </span>
            </div>

            <div className="card-grid">
              <div className="card" style={{ borderColor: isRecording ? `${currentEmotionColor}66` : undefined }}>
                <div className="card-title-row">
                  <span className="card-title">Live Trigger</span>
                  {isRecording && liveEmotion && (
                    <span className="badge" style={{ color: currentEmotionColor, borderColor: `${currentEmotionColor}44` }}>
                      <EmotionIcon label={liveEmotion.label} size={12} />
                      {liveEmotion.label} ({Math.round(liveEmotion.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <button
                  className={`recording-btn ${isRecording ? 'active' : ''}`}
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

              <div className="card">
                <div className="card-title-row">
                  <span className="card-title">Latest Transcript</span>
                </div>
                <p style={{ fontSize: 14, color: lastTranscript ? '#F1F5F9' : '#64748B', margin: 0, lineHeight: 1.5, minHeight: 40 }}>
                  {partialText || lastTranscript || (isRecording ? 'Listening…' : 'Hold the button above and speak. Transcript appears here and streams to your cursor.')}
                </p>
              </div>

              <div className="card">
                <div className="card-title-row">
                  <span className="card-title">Active Speech Model</span>
                  {activeModel && <span className="badge">{activeModel.weightSize}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>
                    {activeModel?.name || 'Whisper Base (English)'}
                  </span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>
                    {activeModel?.description || 'Selected speech recognition model'}
                  </span>
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#F8FAFC', marginBottom: 12 }}>
              Transcripts History
            </h2>

            {history.length === 0 ? (
              <div className="card" style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>
                <p style={{ margin: 0 }}>No dictation history yet. Hold <span className="kbd">fn</span> anywhere to begin speaking.</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => {
                  const emoColor = getEmotionColor(item.emotion?.label);
                  return (
                    <div key={item.id} className="history-card" style={{ borderLeft: `3px solid ${emoColor}` }}>
                      <div className="history-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{item.timestamp}</span>
                          {item.emotion?.label && (
                            <span className="badge" style={{ color: emoColor, borderColor: `${emoColor}40` }}>
                              <EmotionIcon label={item.emotion.label} size={11} />
                              {item.emotion.label} ({Math.round((item.emotion.confidence || 0.9) * 100)}%)
                            </span>
                          )}
                        </div>
                        <button onClick={() => handleCopyText(item.id, item.text)} className="select-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {copiedId === item.id ? <IconCheck size={12} /> : <IconCopy size={12} />}
                          <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="history-text">{item.text}</p>
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
            <div className="page-header">
              <div>
                <h1 className="page-title">Model Management</h1>
                <p className="page-subtitle">
                  Select and manage Whisper speech model weights locally on your system.
                </p>
              </div>
              <span className="badge">
                {models.filter((m) => m.downloaded).length} of {models.length} Downloaded
              </span>
            </div>

            <table className="model-table">
              <thead>
                <tr>
                  <th>Model Identifier</th>
                  <th>Weight File Size</th>
                  <th>Required RAM</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const dl = downloadState[m.id];
                  const isDownloading = dl?.active === true;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#F1F5F9' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{m.description}</div>
                      </td>
                      <td>
                        <span className="badge" style={{ fontWeight: 600, color: '#F1F5F9', background: '#181E2B' }}>
                          {m.weightSize}
                        </span>
                      </td>
                      <td>{m.ramRequired}</td>
                      <td>
                        {isDownloading ? (
                          <span className="badge" style={{ color: '#0EA5E9' }}>
                            <IconSpinner size={10} style={{ animation: 'spin 1s linear infinite' }} />
                            {dl.percent}%
                          </span>
                        ) : m.downloaded ? (
                          <span className="badge" style={{ color: '#10B981', borderColor: '#10B98144' }}>
                            Downloaded
                          </span>
                        ) : (
                          <span className="badge" style={{ color: '#64748B' }}>Not Installed</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!m.downloaded && !isDownloading && (
                            <button onClick={() => handleDownload(m)} className="select-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <IconDownload size={12} />
                              <span>Download</span>
                            </button>
                          )}
                          {m.downloaded && (
                            <button onClick={() => handleSelectModel(m)} className={`select-btn ${selectedModel === m.id ? 'active' : ''}`}>
                              {selectedModel === m.id ? 'Active' : 'Select'}
                            </button>
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
            <div className="page-header">
              <div>
                <h1 className="page-title">Tone &amp; Emotion Analysis</h1>
                <p className="page-subtitle">Acoustic tone classification and history</p>
              </div>
            </div>

            <div className="card-grid">
              {ALL_EMOTIONS.map((emo) => {
                const count = emotionCounts[emo] || 0;
                const color = getEmotionColor(emo);
                return (
                  <div key={emo} className="card" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="card-title-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <EmotionIcon label={emo} size={16} color={color} />
                        <span className="card-title">{emo}</span>
                      </div>
                      <span className="badge" style={{ color }}>{count} logs</span>
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
            <div className="page-header">
              <div>
                <h1 className="page-title">Clipboard History</h1>
                <p className="page-subtitle">Every dictation is saved here and left on the clipboard for ⌘V</p>
              </div>
              {clipboardHistory.length > 0 && (
                <button className="select-btn" onClick={handleClearClipboard} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

            <div className="history-list">
              {clipboardHistory
                .filter((item) => item.text.toLowerCase().includes(clipboardSearch.toLowerCase()))
                .map((item) => (
                  <div key={item.id} className="history-card">
                    <div className="history-meta">
                      <span>{item.timestamp}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleCopyText(item.id, item.text)} className="select-btn">
                          Copy
                        </button>
                        <button onClick={() => handlePasteClipboard(item.text)} className="select-btn active">
                          Paste
                        </button>
                      </div>
                    </div>
                    <p className="history-text">{item.text}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Configure system triggers and options</p>
              </div>
            </div>

            <div className="card">
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
      </main>
    </div>
  );
};
