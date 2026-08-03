import React, { useEffect, useState, useRef } from 'react';
import { X, Check } from 'lucide-react';

const getEmotionColor = (label?: string): string => {
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
      return '#10B981';
  }
};

export const OverlayApp: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveEmotion, setLiveEmotion] = useState<{ label: string; confidence: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubLevel = window.electronAPI.onAudioLevel((lvl) => {
      setAudioLevel(lvl);
    });

    const unsubEmotion = window.electronAPI.onLiveEmotion((emo) => {
      setLiveEmotion(emo);
    });

    const unsubState = window.electronAPI.onRecordingStateChanged((data) => {
      setIsRecording(data.isRecording);
      if (!data.isRecording) setLiveEmotion(null);
    });

    return () => {
      unsubLevel();
      unsubEmotion();
      unsubState();
    };
  }, []);

  const activeColor = getEmotionColor(liveEmotion?.label);

  // Equalizer waveform bars canvas with emotion color
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 11;
      const barWidth = 3;
      const gap = 3;
      const totalWidth = bars * (barWidth + gap) - gap;
      const startX = (canvas.width - totalWidth) / 2;

      for (let i = 0; i < bars; i++) {
        const centerDist = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        const baseFactor = 0.2 + centerDist * 0.3;

        const dynamicAmp = isRecording
          ? Math.max(0.2, audioLevel * Math.sin(phase + i * 0.5) * 0.7 + baseFactor)
          : 0.15;

        const height = Math.min(canvas.height, Math.max(4, dynamicAmp * canvas.height));
        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - height) / 2;

        ctx.fillStyle = isRecording ? activeColor : '#FFFFFF';
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          ctx.roundRect(x, y, barWidth, height, 1.5);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, barWidth, height);
        }
      }

      phase += 0.18;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRecording, audioLevel, activeColor]);

  const handleCancel = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopDictation();
    }
  };

  const handleConfirm = async () => {
    if (window.electronAPI) {
      await window.electronAPI.stopDictation();
    }
  };

  return (
    <div className="overlay-pill-container">
      <div
        className="overlay-pill"
        style={{
          boxShadow: isRecording ? `0 0 16px ${activeColor}66` : undefined,
          borderColor: isRecording ? `${activeColor}aa` : undefined,
        }}
      >
        <button onClick={handleCancel} className="pill-btn pill-btn-cancel" title="Cancel Dictation">
          <X size={14} strokeWidth={2.5} color="#FFFFFF" />
        </button>

        <div className="pill-waveform-wrapper">
          <canvas ref={canvasRef} width={80} height={20} className="pill-canvas" />
        </div>

        <button
          onClick={handleConfirm}
          className="pill-btn pill-btn-confirm"
          style={{ backgroundColor: activeColor }}
          title="Confirm & Paste"
        >
          <Check size={14} strokeWidth={3} color="#FFFFFF" />
        </button>
      </div>
    </div>
  );
};
