import { useEffect, useRef, useState } from "react";

interface WaveformVisualizerProps {
  audioSrc?: string | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  className?: string;
  waveformDataOverride?: number[] | null;
}

export default function WaveformVisualizer({ audioSrc = null, isPlaying, currentTime = 0, duration = 1, className = "", waveformDataOverride = null }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const waveformDataRef = useRef<Map<string, number[]>>(new Map());
  const RAF = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [animatedTime, setAnimatedTime] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    // If parent provided precomputed waveform, use it immediately.
    if (waveformDataOverride && waveformDataOverride.length) {
      setWaveformData(waveformDataOverride);
      return;
    }

    // Check cache first
    const cachedData = audioSrc ? waveformDataRef.current.get(audioSrc) : undefined;
    if (cachedData) {
      setWaveformData(cachedData);
      return;
    }

    // Generate actual waveform from audio file in background with cleanup
    const abortController = new AbortController();
    const generateWaveform = async () => {
      let audioContext: AudioContext | null = null;
      try {
        if (!audioSrc) return;
        audioContext = new AudioContext();
        const response = await fetch(audioSrc, { signal: abortController.signal });
        const arrayBuffer = await response.arrayBuffer();
        if (abortController.signal.aborted) return;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const channelData = audioBuffer.getChannelData(0);
        const samples = 100;
        const blockSize = Math.max(1, Math.floor(channelData.length / samples));
        const waveform: number[] = [];

        for (let i = 0; i < samples; i++) {
          let sum = 0;
          const start = i * blockSize;
          const end = Math.min(channelData.length, start + blockSize);
          for (let j = start; j < end; j++) sum += Math.abs(channelData[j]);
          waveform.push(sum / (end - start || 1));
        }

        if (!abortController.signal.aborted) {
          setWaveformData(waveform);
          waveformDataRef.current.set(audioSrc, waveform);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Error generating waveform:', error);
        }
      } finally {
        if (audioContext) {
          try { await audioContext.close(); } catch {}
        }
      }
    };

    generateWaveform();
    return () => abortController.abort();
  }, [audioSrc, waveformDataOverride]);

  // Removed placeholder generation; we rely on precomputed or fetched waveform

  // Animate progress between timeupdate events using rAF
  useEffect(() => {
    if (!duration || duration <= 0) return;
    const step = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = (ts - last) / 1000; // seconds
      lastTsRef.current = ts;

      setAnimatedTime(prev => {
        if (isPlaying) {
          const next = prev + dt;
          return Math.min(duration, Math.max(0, next));
        }
        // Ease toward currentTime when paused
        const target = currentTime;
        const alpha = 0.2; // smoothing factor
        const next = prev + (target - prev) * alpha;
        return Math.min(duration, Math.max(0, next));
      });

      RAF.current = requestAnimationFrame(step);
    };
    RAF.current = requestAnimationFrame(step);
    return () => {
      if (RAF.current != null) cancelAnimationFrame(RAF.current);
      RAF.current = null;
      lastTsRef.current = null;
    };
  }, [isPlaying, currentTime, duration]);

  // Draw waveform with progress
  useEffect(() => {
    if (!canvasRef.current || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Smooth animation
    ctx.imageSmoothingEnabled = true;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    const barCount = waveformData.length;
    const barWidth = 3;
    const gap = 1;
    const totalBarWidth = barWidth + gap;
    const maxBarHeight = height * 0.75; // Use 75% of height for bars
    const centerY = height / 2;
    
    // Find the max value for normalization
    const maxData = Math.max(...waveformData);

    // Calculate progress (0 to barCount-1)
    const progress = Math.max(0, Math.min(1, animatedTime / duration)) * barCount;
    const currentBarIndex = Math.floor(progress);

    // Draw waveform bars
    waveformData.forEach((data, i) => {
      const normalizedData = data / maxData;
      const barHeight = Math.max(2, normalizedData * maxBarHeight);
      
      // Position bars from left to right
      const x = i * totalBarWidth;
      
      // Determine if this bar has been played
      const hasBeenPlayed = i < currentBarIndex;
      const isCurrentlyPlaying = i === currentBarIndex;
      
      // Choose color based on playback state
      // gradient across progress for smoother feel
      if (isCurrentlyPlaying) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      } else if (hasBeenPlayed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      } else {
        ctx.fillStyle = 'rgba(160, 160, 160, 0.35)';
      }
      
      // Draw rounded bar (center-aligned vertically)
      ctx.beginPath();
      ctx.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    });
  }, [waveformData, animatedTime, duration]);

  return (
    <canvas
      ref={canvasRef}
      width={520}
      height={40}
      className="h-7.5"
    />
  );
}
