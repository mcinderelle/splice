import { useEffect, useRef, useState } from "react";

interface WaveformVisualizerProps {
  audioSrc?: string | null;
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  className?: string;
  waveformDataOverride?: number[] | null;
  onSeek?: (timeSeconds: number) => void;
}

export default function WaveformVisualizer({ audioSrc = null, isPlaying, currentTime = 0, duration = 1, className = "", waveformDataOverride = null, onSeek }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const waveformDataRef = useRef<Map<string, number[]>>(new Map());
  const RAF = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [animatedTime, setAnimatedTime] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState<number>(520);

  useEffect(() => {
    if (!canvasRef.current) return;

    // If parent provided precomputed waveform, normalize density to match canvas width and duration
    if (waveformDataOverride && waveformDataOverride.length) {
      try {
        const widthPx = canvasRef.current?.clientWidth || 520;
        const maxBarsByWidth = Math.max(60, Math.floor(widthPx / 3));
        const barsPerSecond = 30;
        const targetSamples = Math.max(80, Math.min(maxBarsByWidth, Math.round(Math.max(0.001, duration) * barsPerSecond)));
        const src = waveformDataOverride;
        if (targetSamples === src.length) {
          setWaveformData(src);
        } else if (targetSamples > 0) {
          const out: number[] = new Array(targetSamples).fill(0);
          for (let i = 0; i < targetSamples; i++) {
            const start = Math.floor((i / targetSamples) * src.length);
            const end = Math.floor(((i + 1) / targetSamples) * src.length);
            let sum = 0, count = 0;
            for (let j = start; j < Math.max(end, start + 1); j++) { sum += Math.abs(src[Math.min(j, src.length - 1)]); count++; }
            out[i] = count ? (sum / count) : 0;
          }
          setWaveformData(out);
        } else {
          setWaveformData(src);
        }
      } catch {
        setWaveformData(waveformDataOverride);
      }
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
        // Choose number of bars proportional to duration, capped by available width
        const widthPx = canvasRef.current?.clientWidth || 520;
        const maxBarsByWidth = Math.max(60, Math.floor(widthPx / 3)); // assume ~2px bar + 1px gap
        const barsPerSecond = 30; // density: higher value = more detail for longer clips
        const durationSec = Math.max(0.001, audioBuffer.duration);
        const samples = Math.max(80, Math.min(maxBarsByWidth, Math.round(durationSec * barsPerSecond)));
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
  }, [audioSrc, waveformDataOverride, duration, canvasWidth]);

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
          // Wrap around seamlessly for looped playback
          const next = prev + dt;
          if (!Number.isFinite(duration) || duration <= 0) return 0;
          const wrapped = next % duration;
          return Math.max(0, wrapped);
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

  // Hard-sync animation time to external currentTime on significant jumps (e.g., seeking)
  useEffect(() => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    setAnimatedTime(prev => {
      const diff = Math.abs(prev - currentTime);
      if (diff > 0.05) {
        // Reset rAF delta to avoid time drift after seeking
        lastTsRef.current = null;
        return Math.min(duration, Math.max(0, currentTime));
      }
      return prev;
    });
  }, [currentTime, duration]);

  // Resize observer to keep canvas responsive
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.max(240, Math.floor(entry.contentRect.width));
        setCanvasWidth(w);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

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
    // Scale bar width and gap so bars fit exactly within width
    const desiredBars = Math.max(1, waveformData.length);
    const gap = 1;
    let barWidth = Math.max(2, Math.floor((width - (desiredBars - 1) * gap) / desiredBars));
    const totalBarWidth = barWidth + gap;
    const maxBarHeight = height * 0.75; // Use 75% of height for bars
    const centerY = height / 2;
    
    // Find the max value for normalization
    const maxData = Math.max(...waveformData);

    // Calculate progress (0 to barCount-1)
    const progress = Math.max(0, Math.min(1, animatedTime / duration)) * barCount;
    const currentBarIndex = Math.floor(progress);

    // Compute leftover pixels and add to last bar to ensure full width coverage
    const usedWidth = desiredBars * barWidth + (desiredBars - 1) * gap;
    const leftover = Math.max(0, width - usedWidth);

    // Draw waveform bars
    waveformData.forEach((data, i) => {
      const normalizedData = data / maxData;
      const barHeight = Math.max(2, normalizedData * maxBarHeight);
      
      // Position bars from left to right
      const x = i * totalBarWidth;
      const w = i === desiredBars - 1 ? barWidth + leftover : barWidth;
      
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
      ctx.roundRect(x, centerY - barHeight / 2, w, barHeight, Math.min(w, barWidth) / 2);
      ctx.fill();
    });
  }, [waveformData, animatedTime, duration]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={40}
      className={`h-7.5 w-full ${className}`}
      onClick={(e)=>{
        try {
          e.stopPropagation();
          if (!onSeek || !canvasRef.current || !duration || duration <= 0) return;
          const rect = canvasRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, x / rect.width));
          const target = ratio * duration;
          onSeek(target);
        } catch {}
      }}
    />
  );
}
