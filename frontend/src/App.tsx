import React, { useState, useEffect } from 'react';
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

export const getEmotionColor = (label?: string): string => {
  switch (label) {
    case 'Energetic':
      return '#F97316';
    case 'Happy':
      return '#F59E0B';
    case 'Focused':
      return '#3B82F6';
    case 'Calm':
      return '#10B981';
    case 'Thoughtful':
      return '#A855F7';
    case 'Neutral':
    default:
      return '#6366F1';
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
      return <IconFire size={size} color={c} />;
    case 'Happy':
      return <IconFace size={size} color={c} />;
    case 'Focused':
      return <IconBolt size={size} color={c} />;
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
  const [activeTab, setActiveTab] = useState<'dictate' | 'models' | 'emotions' | 'settings' | 'clipboard'>(
    'dictate',
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isLongSession, setIsLongSession] = useState(false);
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

  // ── First-launch gate ─────────────────────────────────────────────────────
  // 'checking'  → querying main process (brief)
  // 'needed'    → model missing, showing full-screen setup wizard
  // 'done'      → model present, render main app normally
  const [firstLaunchGate, setFirstLaunchGate] = useState<'checking' | 'needed' | 'done'>('checking');
  const [setupPercent, setSetupPercent] = useState(0);
  const [setupPhase, setSetupPhase] = useState<'waiting' | 'downloading' | 'done' | 'error'>('waiting');
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Accessibility check ───────────────────────────────────────────────────
  const [accessibilityGranted, setAccessibilityGranted] = useState(true);

  // ── Update Notification state ─────────────────────────────────────────────
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloadUrl: string; notes: string } | null>(null);




  const refreshModels = () => {
    window.electronAPI?.getModels().then((data) => {
      if (Array.isArray(data) && data.length > 0) setModels(data);
    });
  };

  // ── First-launch check ────────────────────────────────────────────────────
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

    // Check accessibility status
    const checkAccess = () => {
      window.electronAPI.checkAccessibility?.().then((granted) => {
        setAccessibilityGranted(granted);
      });
    };
    checkAccess();
    // Poll every 3 seconds to auto-clear banner if user enables it in settings
    const interval = setInterval(checkAccess, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestAccessibility = async () => {
    if (window.electronAPI) {
      const ok = await window.electronAPI.requestAccessibility();
      setAccessibilityGranted(ok);
    }
  };


  useEffect(() => {
    if (!window.electronAPI) return;

    refreshModels();

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
      // Update setup wizard progress
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

    const unsubSetupStart = window.electronAPI.onSetupStarted?.((data) => {
      if (data.modelId === 'base.en') {
        setSetupPhase('downloading');
        setSetupError(null);
        setSetupPercent(0);
      }
    });

    const unsubSetupComplete = window.electronAPI.onSetupComplete?.((data) => {
      if (data.modelId === 'base.en') {
        if (data.success) {
          setSetupPercent(100);
          setSetupPhase('done');
          // Small delay so user sees the 100% state before main UI appears
          setTimeout(() => {
            setFirstLaunchGate('done');
            refreshModels();
          }, 900);
        } else {
          setSetupPhase('error');
          setSetupError('Download failed. Please check your internet connection and retry.');
        }
      }
    });

    const unsubState = window.electronAPI.onRecordingStateChanged((data) => {
      setIsRecording(data.isRecording);
      setIsLongSession(data.isLongSession);
      if (!data.isRecording) setLiveEmotion(null);
    });

    const unsubLiveEmo = window.electronAPI.onLiveEmotion((emo) => {
      setLiveEmotion(emo);
    });

    const unsubResult = window.electronAPI.onDictationResult((res) => {
      if (res.text) {
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

    return () => {
      unsubReady();
      unsubDownload();
      if (unsubSetupStart) unsubSetupStart();
      if (unsubSetupComplete) unsubSetupComplete();
      unsubState();
      unsubLiveEmo();
      unsubResult();
      unsubModel();
      if (unsubClipboard) unsubClipboard();
      if (unsubUpdate) unsubUpdate();
    };

  }, []);

  const handleRetrySetup = () => {
    setSetupPhase('waiting');
    setSetupError(null);
    setSetupPercent(0);
    window.electronAPI?.retrySetup?.();
  };

  const toggleRecording = () => {
    if (isRecording) {
      window.electronAPI?.stopDictation();
    } else {
      window.electronAPI?.startDictation(false);
    }
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
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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

  // ── First-launch gate render ───────────────────────────────────────────────
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
        justifyContent: 'center', fontFamily: 'var(--font-family)',
        WebkitAppRegion: 'drag' as any,
      }}>
        {/* App brand */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#13161C', border: '1px solid #252D3D',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IconWaves size={20} color="#10B981" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.3px' }}>
            Wisper Emotion
          </span>
        </div>

        {/* Setup card */}
        <div style={{
          width: 420, background: '#13161C', border: '1px solid #1F2533',
          borderRadius: 16, padding: '32px 32px 28px', WebkitAppRegion: 'no-drag' as any,
        }}>
          {/* Header */}
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: isDone ? '#064E3B' : isError ? '#450a0a' : '#1E2A40',
              border: `1px solid ${isDone ? '#10B981' : isError ? '#ef4444' : '#3B82F6'}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              transition: 'all 0.4s ease',
            }}>
              {isDone
                ? <IconCheck size={24} color="#10B981" />
                : isError
                  ? <IconShield size={24} color="#ef4444" />
                  : <IconDownload size={24} color="#3B82F6"
                      style={isDownloading || isWaiting ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}} />
              }
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>
              {isDone ? 'You\u2019re all set!' : isError ? 'Download failed' : 'Setting up Wisper'}
            </h2>
            <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55 }}>
              {isDone
                ? 'Whisper Base is ready. Opening the app\u2026'
                : isError
                  ? (setupError || 'An error occurred. Check your internet connection.')
                  : 'Downloading the default speech model (Whisper Base \u2014 142\u00a0MB). This only happens once.'}
            </p>
          </div>

          {/* Progress bar */}
          {!isError && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  {isDone ? 'Complete' : isDownloading ? 'Downloading\u2026' : 'Starting\u2026'}
                </span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: isDone ? '#10B981' : '#3B82F6' }}>
                  {setupPercent}%
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 999, background: '#1E293B', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${setupPercent}%`,
                  background: isDone ? '#10B981' : 'linear-gradient(90deg, #3B82F6, #6366F1)',
                  borderRadius: 999,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Step indicators */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: isError ? 20 : 0 }}>
            {[
              { label: 'Prepare model directory', done: setupPhase !== 'waiting' },
              { label: 'Download Whisper Base (base.en \u2014 142\u00a0MB)', done: isDone },
              { label: 'Initialise speech engine', done: isDone },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: step.done ? '#064E3B' : isError ? '#1c1c1c' : '#1E293B',
                  border: `1px solid ${step.done ? '#10B981' : isError ? '#374151' : '#2E3A50'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease',
                }}>
                  {step.done
                    ? <IconCheck size={11} color="#10B981" />
                    : (!isError && i === (isDownloading ? 1 : 0)
                        ? <IconSpinner size={11} style={{ animation: 'spin 1s linear infinite' }} />
                        : <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#374151', display: 'block' }} />)
                  }
                </div>
                <span style={{ fontSize: 12, color: step.done ? '#94A3B8' : isError ? '#374151' : '#64748B' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Error retry */}
          {isError && (
            <button
              onClick={handleRetrySetup}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                background: '#3B82F6', color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <IconDownload size={14} />
              Retry download
            </button>
          )}
        </div>

        <p style={{ marginTop: 18, fontSize: 11, color: '#374151' }}>
          Downloaded once \u2014 stored locally, never sent to the cloud.
        </p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div
            className="brand-icon-box"
            style={{ borderColor: isRecording ? currentEmotionColor : undefined }}
          >
            <IconWaves size={16} color={isRecording ? currentEmotionColor : '#10B981'} />
          </div>
          <div>
            <div className="brand-title">Wispr Flow</div>
            <div className="brand-subtitle">Voice &amp; Emotion Engine</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'dictate' ? 'active' : ''}`}
            onClick={() => setActiveTab('dictate')}
          >
            <div className="nav-left">
              <IconMic
                size={16}
                className="nav-icon"
                color={isRecording ? currentEmotionColor : undefined}
              />
              <span>Dictation</span>
            </div>
            {isRecording && (
              <span
                className="nav-tag"
                style={{ color: currentEmotionColor, backgroundColor: `${currentEmotionColor}22` }}
              >
                {liveEmotion?.label || 'Live'}
              </span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'models' ? 'active' : ''}`}
            onClick={() => setActiveTab('models')}
          >
            <div className="nav-left">
              <IconCpu size={16} className="nav-icon" />
              <span>Models</span>
            </div>
            <span className="nav-tag">
              {models.filter((m) => m.downloaded).length}/{models.length}
            </span>
          </button>

          <button
            className={`nav-item ${activeTab === 'emotions' ? 'active' : ''}`}
            onClick={() => setActiveTab('emotions')}
          >
            <div className="nav-left">
              <IconHeart
                size={16}
                className="nav-icon"
                color={isRecording ? currentEmotionColor : undefined}
              />
              <span>Emotions</span>
            </div>
            {isRecording && (
              <span
                className="nav-tag"
                style={{ color: currentEmotionColor, backgroundColor: `${currentEmotionColor}22` }}
              >
                <EmotionIcon label={liveEmotion?.label} size={11} />
              </span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <div className="nav-left">
              <IconGear size={16} className="nav-icon" />
              <span>Settings</span>
            </div>
          </button>

          <button
            className={`nav-item ${activeTab === 'clipboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('clipboard')}
          >
            <div className="nav-left">
              <IconClipboard size={16} className="nav-icon" />
              <span>Clipboard</span>
            </div>
            {clipboardHistory.length > 0 && (
              <span className="nav-tag">{clipboardHistory.length}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="footer-title">Shortcuts</div>
          <div className="keybind-row">
            <span>Hold to Speak</span>
            <span className="kbd">fn</span>
          </div>
          <div className="keybind-row">
            <span>Hands-Free</span>
            <span className="kbd">fn + Space</span>
          </div>
          <div className="keybind-row">
            <span>Toggle</span>
            <span className="kbd">⌘ ⌥ Space</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {!accessibilityGranted && (
          <div
            className="card animate-fade-in"
            style={{
              marginBottom: '20px',
              borderColor: '#EF444455',
              backgroundColor: '#EF44440c',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <div className="card-title-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                backgroundColor: '#EF444422', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <IconShield size={14} color="#EF4444" />
              </div>
              <span className="card-title" style={{ fontSize: '14px', fontWeight: 600, color: '#FCA5A5' }}>
                Accessibility Permission Required
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: '1.5', marginBottom: '14px' }}>
              macOS requires Accessibility permissions to listen for global keyboard shortcuts (<code className="kbd" style={{ fontSize: '10px' }}>fn</code>, <code className="kbd" style={{ fontSize: '10px' }}>fn + Space</code>, and <code className="kbd" style={{ fontSize: '10px' }}>Shift + C</code>) in the background.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="recording-btn"
                style={{
                  maxWidth: '240px',
                  backgroundColor: '#EF444422',
                  borderColor: '#EF444455',
                  color: '#EF4444',
                  fontSize: '12px',
                  padding: '6px 12px',
                  height: 'auto'
                }}
                onClick={handleRequestAccessibility}
              >
                Grant Permission
              </button>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                Note: Check "Wisper Emotion" under System Settings → Privacy & Security → Accessibility
              </span>
            </div>
          </div>
        )}

        {/* ── DICTATE ── */}
        {activeTab === 'dictate' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Voice Dictation</h1>
                <p className="page-subtitle">
                  Real-time emotion-aware voice dictation across system applications.
                </p>
              </div>
              <span
                className="badge"
                style={{
                  borderColor: isRecording ? `${currentEmotionColor}66` : undefined,
                  backgroundColor: isRecording ? `${currentEmotionColor}15` : undefined,
                  color: isRecording ? currentEmotionColor : '#94A3B8',
                }}
              >
                <div
                  className={`dot-indicator ${isRecording ? 'active' : ''}`}
                  style={{ backgroundColor: isRecording ? currentEmotionColor : undefined }}
                />
                {isRecording ? `Recording (${currentEmotionLabel})` : 'Engine Ready'}
              </span>
            </div>

            <div className="card-grid">
              <div
                className="card"
                style={{
                  borderColor: isRecording ? `${currentEmotionColor}66` : undefined,
                  boxShadow: isRecording ? `0 0 24px ${currentEmotionColor}25` : undefined,
                  transition: 'all 0.3s ease',
                }}
              >
                <div className="card-title-row">
                  <span className="card-title">Live Voice Trigger</span>
                  {isRecording && liveEmotion && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${currentEmotionColor}25`,
                        color: currentEmotionColor,
                        borderColor: `${currentEmotionColor}44`,
                      }}
                    >
                      <EmotionIcon label={liveEmotion.label} size={12} />
                      {liveEmotion.label} ({Math.round(liveEmotion.confidence * 100)}%)
                    </span>
                  )}
                </div>
                <button
                  onClick={toggleRecording}
                  className={`recording-btn ${isRecording ? 'active' : ''}`}
                  style={{
                    backgroundColor: isRecording ? `${currentEmotionColor}22` : undefined,
                    borderColor: isRecording ? currentEmotionColor : undefined,
                    color: isRecording ? currentEmotionColor : undefined,
                    boxShadow: isRecording ? `0 0 20px ${currentEmotionColor}40` : undefined,
                  }}
                >
                  <div
                    className={`dot-indicator ${isRecording ? 'active' : ''}`}
                    style={{ backgroundColor: isRecording ? currentEmotionColor : undefined }}
                  />
                  <IconMic size={17} color={isRecording ? currentEmotionColor : '#10B981'} />
                  <span>
                    {isRecording
                      ? isLongSession
                        ? 'Stop Long Session'
                        : 'Release fn or Click to Finish'
                      : 'Press & Hold fn or Click to Dictate'}
                  </span>
                </button>
              </div>

              <div className="card">
                <div className="card-title-row">
                  <span className="card-title">Active Whisper Model</span>
                  {activeModel && <span className="badge">{activeModel.weightSize}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: '#F8FAFC' }}>
                    {activeModel?.name || 'No model selected'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                    {activeModel?.description || 'Select a downloaded model in the Models tab'}
                  </span>
                </div>
              </div>
            </div>

            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '14px' }}>
              Recent Transcriptions
            </h2>

            {history.length === 0 ? (
              <div className="card" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                <p>
                  No audio transcribed yet. Hold <span className="kbd">fn</span> in any app to
                  dictate.
                </p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((item) => {
                  const emoColor = getEmotionColor(item.emotion?.label);
                  return (
                    <div
                      key={item.id}
                      className="history-card"
                      style={{ borderLeft: `3px solid ${emoColor}` }}
                    >
                      <div className="history-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{item.timestamp}</span>
                          {item.emotion?.label && (
                            <span
                              className="badge"
                              style={{
                                backgroundColor: `${emoColor}20`,
                                color: emoColor,
                                borderColor: `${emoColor}40`,
                              }}
                            >
                              <EmotionIcon label={item.emotion.label} size={11} />
                              {item.emotion.label} (
                              {Math.round((item.emotion.confidence || 0.9) * 100)}%)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleCopyText(item.id, item.text)}
                          className="select-btn"
                          style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          {copiedId === item.id ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconCopy size={12} />
                          )}
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

        {/* ── MODELS ── */}
        {activeTab === 'models' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Whisper Speech Models</h1>
                <p className="page-subtitle">
                  {models.filter((m) => m.downloaded).length} of {models.length} models downloaded
                  locally.
                </p>
              </div>
            </div>

            <table className="model-table">
              <thead>
                <tr>
                  <th>Model Name</th>
                  <th>Weight Size</th>
                  <th>RAM Needed</th>
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
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                          {m.description}
                        </div>
                      </td>
                      <td>
                        <span className="badge">{m.weightSize}</span>
                      </td>
                      <td>{m.ramRequired}</td>
                      <td>
                        {isDownloading ? (
                          <span
                            className="badge"
                            style={{ backgroundColor: '#1E2C40', color: '#60A5FA' }}
                          >
                            <IconSpinner
                              size={10}
                              style={{ animation: 'spin 1s linear infinite' }}
                            />
                            {dl.percent}%
                          </span>
                        ) : m.downloaded ? (
                          <span
                            className="badge"
                            style={{ backgroundColor: '#064E3B', color: '#6EE7B7' }}
                          >
                            Downloaded
                          </span>
                        ) : (
                          <span
                            className="badge"
                            style={{ backgroundColor: '#1C2029', color: '#94A3B8' }}
                          >
                            Not Downloaded
                          </span>
                        )}
                      </td>
                      <td style={{ display: 'flex', gap: '8px' }}>
                        {!m.downloaded && !isDownloading && (
                          <button
                            onClick={() => handleDownload(m)}
                            className="select-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                          >
                            <IconDownload size={12} />
                            <span>Download</span>
                          </button>
                        )}
                        {m.downloaded && (
                          <button
                            onClick={() => handleSelectModel(m)}
                            className={`select-btn ${selectedModel === m.id ? 'active' : ''}`}
                          >
                            {selectedModel === m.id ? 'Active' : 'Select'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── EMOTIONS ── */}
        {activeTab === 'emotions' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Emotion Analytics</h1>
                <p className="page-subtitle">
                  Live acoustic tone analysis and session mood distribution.
                </p>
              </div>
              {isRecording ? (
                <span
                  className="badge badge--live"
                  style={{
                    backgroundColor: `${currentEmotionColor}20`,
                    color: currentEmotionColor,
                    borderColor: `${currentEmotionColor}50`,
                  }}
                >
                  <div className="dot-indicator active" style={{ backgroundColor: currentEmotionColor }} />
                  Analyzing
                </span>
              ) : (
                <span className="badge">Standby</span>
              )}
            </div>

            {/* ── Live Tone Card ── */}
            <div
              className="emo-live-card"
              style={{
                borderColor: isRecording ? `${currentEmotionColor}55` : '#1E2430',
                boxShadow: isRecording ? `0 0 40px ${currentEmotionColor}18` : 'none',
              }}
            >
              {/* Left: dominant emotion */}
              <div className="emo-live-left">
                <div className="emo-icon-ring" style={{ borderColor: `${currentEmotionColor}40`, backgroundColor: `${currentEmotionColor}10` }}>
                  <EmotionIcon
                    label={isRecording ? liveEmotion?.label : history[0]?.emotion?.label}
                    size={36}
                    color={currentEmotionColor}
                  />
                </div>
                <div className="emo-live-label" style={{ color: currentEmotionColor }}>
                  {isRecording
                    ? liveEmotion?.label || 'Listening…'
                    : history[0]?.emotion?.label || 'Neutral'}
                </div>
                <div className="emo-live-sub">
                  {isRecording
                    ? `${Math.round((liveEmotion?.confidence || 0.85) * 100)}% confidence`
                    : 'Acoustic Tone Index'}
                </div>
              </div>

              {/* Divider */}
              <div className="emo-divider" />

              {/* Right: probability bars */}
              <div className="emo-bars-grid">
                {ALL_EMOTIONS.map((emo) => {
                  const emoColor = getEmotionColor(emo);
                  const isSelected =
                    (isRecording ? liveEmotion?.label : history[0]?.emotion?.label) === emo;
                  const val =
                    (isRecording
                      ? liveEmotion?.scores?.[emo]
                      : history[0]?.emotion?.scores?.[emo]) || (isSelected ? 0.85 : 0.05);
                  const pct = Math.round(val * 100);

                  return (
                    <div key={emo} className={`emo-bar-row ${isSelected ? 'selected' : ''}`}>
                      <div className="emo-bar-label">
                        <div className="emo-bar-icon">
                          <EmotionIcon label={emo} size={13} color={isSelected ? emoColor : '#64748B'} />
                        </div>
                        <span style={{ color: isSelected ? '#F8FAFC' : '#94A3B8' }}>{emo}</span>
                      </div>
                      <div className="emo-bar-track">
                        <div
                          className="emo-bar-fill"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: emoColor,
                            opacity: isSelected ? 1 : 0.45,
                          }}
                        />
                      </div>
                      <span className="emo-bar-pct" style={{ color: isSelected ? emoColor : '#475569' }}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Mood Distribution ── */}
            <div className="section-header">
              <IconActivity size={14} color="#94A3B8" />
              <h2 className="section-title">Mood Distribution</h2>
              <span className="section-count">{totalLogs} sessions</span>
            </div>

            <div className="emo-dist-grid">
              {ALL_EMOTIONS.map((emo) => {
                const count = emotionCounts[emo] || 0;
                const pct = totalLogs > 0 ? Math.round((count / totalLogs) * 100) : 0;
                const color = getEmotionColor(emo);
                const barWidth = totalLogs > 0 ? (count / Math.max(...Object.values(emotionCounts))) * 100 : 0;

                return (
                  <div key={emo} className="emo-dist-card" style={{ borderTopColor: color }}>
                    <div className="emo-dist-top">
                      <div className="emo-dist-icon" style={{ backgroundColor: `${color}15`, borderColor: `${color}25` }}>
                        <EmotionIcon label={emo} size={18} color={color} />
                      </div>
                      <div>
                        <div className="emo-dist-name">{emo}</div>
                        <div className="emo-dist-count">{count} <span>sessions</span></div>
                      </div>
                      <div className="emo-dist-pct" style={{ color }}>
                        {pct}%
                      </div>
                    </div>
                    <div className="emo-dist-bar-track">
                      <div
                        className="emo-dist-bar-fill"
                        style={{ width: `${barWidth}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Emotion Log ── */}
            <div className="section-header" style={{ marginTop: '28px' }}>
              <IconActivity size={14} color="#94A3B8" />
              <h2 className="section-title">Classification Log</h2>
            </div>

            <div className="history-list">
              {history.length === 0 ? (
                <div className="card" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                  <p>Emotion classifications appear here when you speak into the microphone.</p>
                </div>
              ) : (
                history.map((item) => {
                  const emoColor = getEmotionColor(item.emotion?.label);
                  return (
                    <div
                      key={item.id}
                      className="history-card"
                      style={{ borderLeft: `3px solid ${emoColor}` }}
                    >
                      <div className="history-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{item.timestamp}</span>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: `${emoColor}25`,
                              color: emoColor,
                              borderColor: `${emoColor}40`,
                            }}
                          >
                            <EmotionIcon label={item.emotion?.label} size={11} />
                            {item.emotion?.label || 'Neutral'} (
                            {Math.round((item.emotion?.confidence || 0.9) * 100)}%)
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyText(item.id, item.text)}
                          className="select-btn"
                          style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                          {copiedId === item.id ? (
                            <IconCheck size={12} />
                          ) : (
                            <IconCopy size={12} />
                          )}
                          <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="history-text">{item.text}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab === 'settings' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Settings &amp; Permissions</h1>
                <p className="page-subtitle">Configure system text injection and macOS shortcuts.</p>
              </div>
            </div>

            <div className="card" style={{ gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Accessibility Text Injection</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    Pastes transcribed text via native Cmd+V into the active input field.
                  </div>
                </div>
                <span className="badge" style={{ backgroundColor: '#064E3B', color: '#6EE7B7' }}>
                  <IconShield size={12} /> Active
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #1A1E26',
                  paddingTop: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Dynamic Floating Pill</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    Shows a floating audio pill only while speaking with live emotion color feedback.
                  </div>
                </div>
                <span className="badge" style={{ backgroundColor: '#064E3B', color: '#6EE7B7' }}>
                  Enabled
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #1A1E26',
                  paddingTop: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>Shift + C Global Paste</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    Press Shift + C globally to paste the last spoken/transcribed text or clipboard.
                  </div>
                </div>
                <button
                  className={`select-btn ${shiftCPasteEnabled ? 'active' : ''}`}
                  onClick={() => handleToggleShiftC(!shiftCPasteEnabled)}
                >
                  {shiftCPasteEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CLIPBOARD ── */}
        {activeTab === 'clipboard' && (
          <div>
            <div className="page-header">
              <div>
                <h1 className="page-title">Clipboard History</h1>
                <p className="page-subtitle">
                  Browse, search, copy and paste your history of copied and spoken text.
                </p>
              </div>
              {clipboardHistory.length > 0 && (
                <button
                  className="select-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', borderColor: '#E11D48', color: '#FDA4AF' }}
                  onClick={handleClearClipboard}
                >
                  <IconTrash size={12} color="#FDA4AF" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: '20px' }}>
              <input
                type="text"
                placeholder="Search clipboard history..."
                value={clipboardSearch}
                onChange={(e) => setClipboardSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
              />
            </div>

            {/* List */}
            {(() => {
              const filtered = clipboardHistory.filter(item =>
                item.text.toLowerCase().includes(clipboardSearch.toLowerCase())
              );

              if (filtered.length === 0) {
                return (
                  <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                      <IconClipboard size={24} color="#56637A" />
                    </div>
                    <p>{clipboardSearch ? 'No matching items found.' : 'Clipboard history is empty. Copy text or use dictation to build history.'}</p>
                  </div>
                );
              }

              return (
                <div className="history-list">
                  {filtered.map((item) => (
                    <div key={item.id} className="history-card" style={{ borderLeft: '3px solid #64748B' }}>
                      <div className="history-meta">
                        <span>{item.timestamp}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleCopyText(item.id, item.text)}
                            className="select-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                          >
                            {copiedId === item.id ? <IconCheck size={12} /> : <IconCopy size={12} />}
                            <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            onClick={() => handlePasteClipboard(item.text)}
                            className="select-btn active"
                            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                          >
                            <IconMic size={12} color="#93C5FD" />
                            <span>Paste</span>
                          </button>
                        </div>
                      </div>
                      <p className="history-text" style={{ whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto' }}>
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </main>

      {/* ── UPDATE NOTIFICATION MODAL ── */}
      {updateInfo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(5, 5, 8, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, fontFamily: 'var(--font-family)',
        }}>
          <div style={{
            width: 440, backgroundColor: '#13161C', border: '1px solid #1F2533',
            borderRadius: 16, padding: '32px', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14,
                backgroundColor: '#3B82F615', border: '1px solid #3B82F633',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <IconCpu size={26} color="#3B82F6" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 6 }}>
                New Update Available!
              </h2>
              <span className="badge" style={{ backgroundColor: '#3B82F622', color: '#60A5FA', borderColor: '#3B82F633' }}>
                v{updateInfo.version}
              </span>
            </div>

            {/* Description / Notes */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', tracking: '0.5px' as any, marginBottom: 8 }}>
                Changelog
              </h3>
              <div style={{
                backgroundColor: '#090B0E', border: '1px solid #1F2533', borderRadius: 8,
                padding: '12px 16px', fontSize: 13, color: '#E2E8F0', lineHeight: 1.55,
                maxHeight: 140, overflowY: 'auto',
              }}>
                {updateInfo.notes}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="select-btn"
                style={{ flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600 }}
                onClick={() => setUpdateInfo(null)}
              >
                Later
              </button>
              <button
                className="recording-btn"
                style={{
                  flex: 1.5, padding: '10px 0', fontSize: 13, fontWeight: 600,
                  backgroundColor: '#3B82F6', borderColor: '#3B82F6', color: '#FFF',
                  height: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}
                onClick={() => window.electronAPI.openExternalLink(updateInfo.downloadUrl)}
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
