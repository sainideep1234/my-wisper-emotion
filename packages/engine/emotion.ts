export type EmotionLabel = 'Neutral' | 'Calm' | 'Focused' | 'Happy' | 'Thoughtful' | 'Energetic';

export interface EmotionResult {
  label: EmotionLabel;
  confidence: number;
  scores: Record<string, number>;
}

/** Lightweight acoustic heuristic (ONNX emotion optional later). */
export function detectEmotion(pcmData: Float32Array): EmotionResult {
  if (pcmData.length < 1600) {
    return {
      label: 'Neutral',
      confidence: 0.9,
      scores: { Neutral: 0.9, Calm: 0.05, Focused: 0.03, Thoughtful: 0.02, Happy: 0.0, Energetic: 0.0 },
    };
  }

  let zeroCrossings = 0;
  let sumVal = 0;
  for (let i = 1; i < pcmData.length; i++) {
    if ((pcmData[i - 1]! >= 0 && pcmData[i]! < 0) || (pcmData[i - 1]! < 0 && pcmData[i]! >= 0)) {
      zeroCrossings++;
    }
    sumVal += Math.abs(pcmData[i]!);
  }

  const avgAmp = sumVal / pcmData.length;
  const zcr = zeroCrossings / pcmData.length;

  let selectedLabel: EmotionLabel = 'Focused';
  if (avgAmp > 0.07 && zcr > 0.04) selectedLabel = 'Energetic';
  else if (avgAmp > 0.035) selectedLabel = 'Happy';
  else if (zcr < 0.025 && avgAmp < 0.03) selectedLabel = 'Calm';
  else if (avgAmp < 0.015) selectedLabel = 'Thoughtful';
  else if (avgAmp < 0.02) selectedLabel = 'Neutral';

  const baseConf = Math.min(0.96, Math.max(0.75, 0.82 + avgAmp * 3.0));

  const rawScores: Record<EmotionLabel, number> = {
    Energetic: selectedLabel === 'Energetic' ? baseConf : Math.max(0.01, avgAmp * 5.0),
    Happy: selectedLabel === 'Happy' ? baseConf : Math.max(0.02, avgAmp * 3.0),
    Focused: selectedLabel === 'Focused' ? baseConf : 0.1,
    Calm: selectedLabel === 'Calm' ? baseConf : Math.max(0.02, (0.05 - avgAmp) * 4.0),
    Thoughtful: selectedLabel === 'Thoughtful' ? baseConf : 0.05,
    Neutral: selectedLabel === 'Neutral' ? baseConf : 0.08,
  };

  const totalScore = Object.values(rawScores).reduce((a, b) => a + b, 0);
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawScores)) {
    scores[k] = parseFloat((v / totalScore).toFixed(2));
  }

  return {
    label: selectedLabel,
    confidence: parseFloat(baseConf.toFixed(2)),
    scores,
  };
}
