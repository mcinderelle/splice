import { Chip, CircularProgress, Tooltip } from "@nextui-org/react";
import { ClockCircleLinearIcon, ClockSquareBoldIcon } from '@nextui-org/shared-icons'
import { MusicalNoteIcon, ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";
import { useState, useRef, useEffect, memo } from "react";
import * as wav from "node-wav";
import { httpFetch } from "../../utils/httpFetch";
import { cfg } from "../../config";
import { SamplePlaybackContext } from "../playback";
import { SpliceTag } from "../../splice/entities";
import { SpliceSample } from "../../splice/api";
import { decodeSpliceAudio } from "../../splice/decoder";
import WaveformVisualizer from "./WaveformVisualizer";
import { useToast } from "../toast";

const getChordTypeDisplay = (type: string | null) =>
  type == null ? "" : type == "major" ? " Major" : " Minor";

export type TagClickHandler = (tag: SpliceTag) => void;

/**
 * Provides a view describing a Splice sample.
 */
function SampleListEntryBase(
  { sample, ctx, onTagClick, waveformWidth = 360, compact = false, hoverAudition = false, hoverDelayMs = 150 }: {
    sample: SpliceSample,
    ctx: SamplePlaybackContext,
    onTagClick: TagClickHandler,
    waveformWidth?: number,
    compact?: boolean,
    hoverAudition?: boolean,
    hoverDelayMs?: number
  }
) {
  const [fgLoading, setFgLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const decodedSampleRef = useRef<Uint8Array | null>(null);
  const fetchAheadRef = useRef<Promise<any> | null>(null);
  const lastErrorLoggedSrcRef = useRef<string | null>(null);

  const { notify } = useToast();
  const [playbackRate, setPlaybackRate] = useState(1);
  const [semitones, setSemitones] = useState(0);
  const effectiveRate = playbackRate * Math.pow(2, semitones / 12);

  const pack = sample.parents.items[0];
  const packCover = pack
    ? pack.files.find(x => x.asset_file_type_slug == "cover_image")?.url
    : "img/missing-cover.png";
  function startFetching() {
    if (fetchAheadRef.current != null)
      return;

    const file = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;

    // Safe performance marks (avoid reserved names)
    try { performance.mark('sample-fetch-start'); } catch {}
    fetchAheadRef.current = httpFetch(file.url, {
      method: "GET",
      responseType: 'Binary'
    }).finally(() => {
      try { performance.mark('sample-fetch-end'); } catch {}
      try { performance.measure('sample-fetch-duration', 'sample-fetch-start', 'sample-fetch-end'); } catch {}
    });
    
    // Start decoding immediately in the background
    ensureAudioDecoded().catch(console.error);
  }

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = document.createElement("audio");
    }
    const audio = audioRef.current;
    
    // Use low-latency hints
    try {
      (audio as any).preservesPitch = true;
    } catch {}
    
    // Enable native gapless looping for loop samples
    audio.loop = sample.asset_category_slug === 'loop';
    
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (duration === 0 && audio.duration) {
        setDuration(audio.duration);
      }
    };
    
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      // Clear any stale error once metadata is ready
      setErrorMessage(null);
      // Apply rate/pitch on load
      audio.playbackRate = playbackRate * Math.pow(2, semitones / 12);
    };
    
    const handleEnded = () => {
      setPlaying(false);
    };
    
    const handleError = (_e: Event) => {
      // Silenced: too noisy and often non-fatal across browsers
      // We only reset loading indicators but do not surface errors
      setFgLoading(false);
    };
    
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      // Clean up blob URL (only for blob: URLs)
      if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = null;
    };
  }, [sample.asset_category_slug]);

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);
  }

  // Hover audition with delay
  const hoverTimerRef = useRef<number | null>(null);
  const onMouseEnter = () => {
    if (!hoverAudition) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => { handlePlayClick(); }, hoverDelayMs);
  };
  const onMouseLeave = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    if (hoverAudition) stop();
  };

  // Prefetch and decode on mount for instant playback and immediate waveform
  useEffect(() => {
    try {
      // idle hint
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => startFetching());
      } else {
        startFetching();
      }
      // Decode in background without toggling UI loading state
      ensureAudioDecoded().catch(() => {});
    } catch {
      // noop: background prefetch failure is handled on-demand later
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePlayClick(ev?: React.MouseEvent) {
    try {
      // Prevent event propagation for drag
      if (ev) {
        ev.stopPropagation();
      }

      // Stop any currently playing sample
      ctx.cancellation?.();

      // If already playing, just stop
      if (playing) {
        stop();
        return;
      }

      if (!audioRef.current) {
        return;
      }

      const audio = audioRef.current;

      // Load and play
      if (!blobUrlRef.current || audio.src == "") {
        // Only show loading if not already decoded
        const needsDecoding = decodedSampleRef.current == null;
        if (needsDecoding) {
          setFgLoading(true);
        }
        
        setErrorMessage(null);
        try { performance.mark('sample-decode-start'); } catch {}
        await ensureAudioDecoded();
        try { performance.mark('sample-decode-end'); } catch {}
        try { performance.measure('sample-decode-duration', 'sample-decode-start', 'sample-decode-end'); } catch {}
        
        // Clean up any existing blob URL
        if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        // Create blob URL from decoded audio data
        const decodedBuffer = decodedSampleRef.current!;
        // Ensure that we create the Blob from an ArrayBuffer, and not from SharedArrayBuffer or invalid variant
        let arrayBuffer: ArrayBuffer;
        if (decodedBuffer instanceof ArrayBuffer) {
          arrayBuffer = decodedBuffer;
        } else if (decodedBuffer instanceof Uint8Array) {
          // Convert to a proper ArrayBuffer by copying the data
          arrayBuffer = new Uint8Array(decodedBuffer).buffer;
        } else {
          throw new Error("Decoded buffer is not an ArrayBuffer or Uint8Array");
        }
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        blobUrlRef.current = URL.createObjectURL(blob);

        // Set audio source
        audio.src = blobUrlRef.current;
        // Allow a single error log for this new src
        lastErrorLoggedSrcRef.current = null;
        // Ensure current preview settings
        audio.playbackRate = playbackRate * Math.pow(2, semitones / 12);
        
        // Wait for audio to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('loadeddata', handleLoadedData);
            audio.removeEventListener('error', handleError);
            reject(new Error('Audio load timeout'));
          }, 10000);
          
          const handleCanPlay = () => {
            clearTimeout(timeout);
            cleanup();
            resolve();
          };
          
          const handleLoadedData = () => {
            clearTimeout(timeout);
            cleanup();
            resolve();
          };
          
          const handleError = (e: Event) => {
            clearTimeout(timeout);
            cleanup();
            reject(new Error('Audio failed to load'));
          };
          
          const cleanup = () => {
            audio.removeEventListener('canplay', handleCanPlay);
            audio.removeEventListener('loadeddata', handleLoadedData);
            audio.removeEventListener('error', handleError);
          };
          
          audio.addEventListener('canplay', handleCanPlay, { once: true });
          audio.addEventListener('loadeddata', handleLoadedData, { once: true });
          audio.addEventListener('error', handleError, { once: true });
          
          // Start loading
          audio.load();
        });
        
        setFgLoading(false);
      }

      try {
        await audio.play();
      } catch (err) {
        console.error('Failed to start audio:', err);
        setErrorMessage('Failed to start audio');
        notify('error', 'Failed to start audio');
        setFgLoading(false);
        setPlaying(false);
        return;
      }
      setPlaying(true);
      setErrorMessage(null);

      ctx.setCancellation(() => stop);
    } catch (error) {
      console.error("Error playing audio:", error);
      setErrorMessage('Could not play sample');
      notify('error', 'Failed to play sample');
      setFgLoading(false);
      setPlaying(false);
    }
  }

  async function ensureAudioDecoded() {
    if (decodedSampleRef.current != null)
      return;

    if (fetchAheadRef.current == null) {
      startFetching();
    }

    try {
      const resp = await fetchAheadRef.current;
      // Ensure resp.data is Uint8Array in both browser and Tauri
      const bytes = resp && resp.data instanceof Uint8Array
        ? resp.data
        : new Uint8Array(resp?.data ?? []);
      decodedSampleRef.current = decodeSpliceAudio(bytes);
    } catch (error) {
      console.error("Error decoding audio:", error);
      setErrorMessage('Audio decode error');
      notify('error', 'Decode failed');
      throw error;
    }
  }

  // Cross-platform filename sanitization
  // Removes invalid characters for Windows, Linux, and macOS
  const sanitizePath = (x: string) => x.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/[^\x20-\x7E]/g, "_");

  // Handle web download
  async function handleWebDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      setFgLoading(true);
      
      // Get the original MP3 URL
      const file = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;
      
      // Use simple anchor link for browser download
      const link = document.createElement('a');
      link.href = file.url;
      link.download = `${sanitizePath(sample.name)}.mp3`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setFgLoading(false);
    } catch (error) {
      console.error("Error downloading file:", error);
      setFgLoading(false);
    }
  }

  // Handle web drag (using native HTML5 drag API)
  function handleWebDragStart(ev: React.DragEvent) {
    if (typeof window === 'undefined' || '__TAURI__' in window) {
      return; // Use Tauri drag in desktop app
    }

    ev.dataTransfer.effectAllowed = 'copy';

    const srcFile = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;
    const mp3Name = `${sanitizePath(sample.name)}.mp3`;
    const wavName = `${sanitizePath(sample.name)}.wav`;

    // If we already have a decoded buffer, offer a WAV blob for better DAW import
    if (decodedSampleRef.current) {
      try {
        const actx = new AudioContext();
        const decodePromise = actx.decodeAudioData(decodedSampleRef.current.buffer as any);
        decodePromise.then((samples) => {
          const channels: Float32Array[] = [];
          for (let i = 0; i < samples.numberOfChannels; i++) {
            channels.push(samples.getChannelData(i));
          }
          const wavBuffer = wav.encode(channels as any, {
            bitDepth: 16,
            sampleRate: samples.sampleRate
          });
          const wavBytes = wavBuffer instanceof Uint8Array ? wavBuffer : new Uint8Array(wavBuffer as any);
          const blob = new Blob([wavBytes.buffer], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);
          // Chrome/Edge support a proprietary DownloadURL drag format
          // format: mimeType:filename:url
          ev.dataTransfer.setData('DownloadURL', `audio/wav:${wavName}:${url}`);
          ev.dataTransfer.setData('text/uri-list', url);
          ev.dataTransfer.setData('text/plain', url);
        }).catch(() => {
          // Fallback to MP3 URL if decode fails
          ev.dataTransfer.setData('DownloadURL', `audio/mpeg:${mp3Name}:${srcFile.url}`);
          ev.dataTransfer.setData('text/uri-list', srcFile.url);
          ev.dataTransfer.setData('text/plain', srcFile.url);
        });
        return;
      } catch {
        // ignore and fallback below
      }
    }

    // Fallback: provide the original MP3 URL for drag targets that accept links
    ev.dataTransfer.setData('DownloadURL', `audio/mpeg:${mp3Name}:${srcFile.url}`);
    ev.dataTransfer.setData('text/uri-list', srcFile.url);
    ev.dataTransfer.setData('text/plain', srcFile.url);
  }

  async function handleDrag(ev: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    try {
      // Only support drag in Tauri mode
      if (typeof window === 'undefined' || !('__TAURI__' in window)) {
        console.log('Drag and drop is only available in the Tauri desktop app');
        return;
      }
      
      // Verify that the parent of the element that we began the dragging from
      // is not explicitly marked as non-draggable (as it may be clicked etc.)
      const dragOrigin = document.elementFromPoint(ev.clientX, ev.clientY)?.parentElement;
      if (dragOrigin != null && dragOrigin.dataset.draggable === "false") {
        return;
      }

      const samplePath = sanitizePath(pack.name) + "/" + sanitizePath(sample.name);
      const targetPath = samplePath + ".wav";

      // Import Tauri modules dynamically
      const { path } = await import('@tauri-apps/api');
      const { startDrag } = await import('@crabnebula/tauri-plugin-drag');
      const { checkFileExists, createPlaceholder, writeSampleFile } = await import('../../native');

    const dragParams = {
      item: [await path.join(cfg().sampleDir, targetPath)],
      icon: ""
    };

    setFgLoading(true);
    await ensureAudioDecoded();

    if (!await checkFileExists(cfg().sampleDir, targetPath)) {
      if (cfg().placeholders) {
        await createPlaceholder(cfg().sampleDir, targetPath);
        startDrag(dragParams);
      }

      const actx = new AudioContext();

      const samples = await actx.decodeAudioData(decodedSampleRef.current!.buffer as any);
      const channels: Float32Array[] = [];

      // For shorter samples: slightly trim the leading silence for snappier transients
      if (samples.length < 60 * 44100) {
        for (let i = 0; i < samples.numberOfChannels; i++) {
          const chan = samples.getChannelData(i);
          const start = 1200;
          const end = Math.min(chan.length, ((sample.duration / 1000) * samples.sampleRate) + start);
          channels.push(chan.subarray(start, end));
        }
      } else {
        // For long samples: write full channels to avoid extra allocations
        for (let i = 0; i < samples.numberOfChannels; i++) {
          channels.push(samples.getChannelData(i));
        }
      }

      await writeSampleFile(cfg().sampleDir, targetPath, wav.encode(channels as any, {
        bitDepth: 16,
        sampleRate: samples.sampleRate
      }));

      if (!cfg().placeholders) {
        startDrag(dragParams);
      }

      setFgLoading(false);
    } else {
      setFgLoading(false);
      startDrag(dragParams);
    }
    } catch (error) {
      console.error("Error handling drag operation:", error);
      setErrorMessage('Drag operation failed');
      notify('error', 'Drag failed');
      setFgLoading(false);
    }
  }

  return (
    <div onMouseOver={startFetching}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`card-subtle flex w-full px-6 py-4 gap-6 rounded-lg min-h-[88px]
                    items-center hover-lift cursor-pointer select-none transition-all duration-300 group ${playing ? 'ring-1 ring-blue-500/40 bg-white/5' : ''}`}
    >
      { /* when loading, set the cursor for everything to a waiting icon */}
      {fgLoading && <style> {`* { cursor: wait }`} </style>}

      { /* sample pack */}
      <div className="flex gap-3 min-w-24 items-center">
        <Tooltip
          showArrow
          placement="right"
          delay={250}
          content={
          <div className="flex flex-col gap-3 p-4 animate-scaleIn bg-black rounded-lg shadow-xl">
            <img src={packCover} alt={pack.name} width={128} height={128} className="rounded-lg" />
            <h1 className="font-semibold text-white">{pack.name}</h1>
            <div className="text-xs text-gray-300 flex gap-3 flex-wrap">
              {sample.key && <span>Key: <b>{sample.key.toUpperCase()}</b></span>}
              {sample.bpm && <span>BPM: <b>{sample.bpm}</b></span>}
              {sample.bpm && <span>Preview BPM: <b>{(sample.bpm * effectiveRate).toFixed(1)}</b></span>}
              <span>Dur: <b>{(sample.duration/1000).toFixed(2)}s</b></span>
              <span>Rate: <b>{effectiveRate.toFixed(2)}x</b></span>
              <span>Pitch: <b>{semitones} st</b></span>
            </div>
          </div>
        }>
          <a href={`https://splice.com/sounds/labels/${pack.permalink_base_url}`} target="_blank" 
             className="hover:opacity-80 transition-all duration-300"
             onClick={(e) => e.stopPropagation()}>
            <img src={packCover} alt={pack.name} width={48} height={48} className="rounded-lg object-cover shadow-lg hover:scale-105 transition-transform duration-300" />
          </a>
        </Tooltip>

        <button onClick={handlePlayClick}
             className="play-button cursor-pointer w-14 h-14 rounded-full border-2 border-gray-600 flex items-center justify-center 
                        hover:border-white hover:bg-white/10 transition-all duration-300 backdrop-blur-sm
                        focus:outline-none focus:ring-2 focus:ring-white/50"
             aria-label={playing ? "Stop sample" : "Play sample"}>
          {fgLoading ? (
            <CircularProgress aria-label="Loading sample..." className="h-7 w-7" color="default" size="lg" />
          ) : playing ? (
            <StopIcon className="w-7 h-7" />
          ) : (
            <PlayIcon className="w-7 h-7 ml-1" />
          )}
        </button>
      </div>

      { /* sample name + tags */}
      <div className="grow overflow-hidden" 
           onMouseDown={handleDrag}
           draggable={typeof window !== 'undefined' && !('__TAURI__' in window)}
           onDragStart={handleWebDragStart}
           onClick={handlePlayClick}
           style={{ cursor: "move" }}>
        <div className="flex gap-3 items-center overflow-hidden group-hover:translate-x-1 transition-transform duration-300">
          <span className="font-bold text-base group-hover:text-white transition-colors truncate" title={sample.name}>
            {/** highlight query terms if present in URL param q */}
            {(() => {
              const params = new URLSearchParams(window.location.search);
              const q = (params.get('q') || '').trim();
              const name = (sample.name.split("/").pop() || '') as string;
              if (!q) return name;
              const idx = name.toLowerCase().indexOf(q.toLowerCase());
              if (idx === -1) return name;
              const before = name.slice(0, idx);
              const mid = name.slice(idx, idx + q.length);
              const after = name.slice(idx + q.length);
              return (<>
                {before}
                <span className="bg-white/20 rounded px-1">{mid}</span>
                {after}
              </>);
            })()}
          </span>
          <span className="text-gray-400 text-xs px-3 py-1 bg-gray-800 rounded-full whitespace-nowrap">{sample.asset_category_slug}</span>
        </div>

        {errorMessage && !playing && (
          <div className="mt-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        <div className="flex gap-2 mt-3 flex-wrap">{sample.tags.map(x => (
          <Chip key={x.uuid}
            size="sm" 
            style={{ cursor: "pointer" }}
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onTagClick(x); }}
            data-draggable="false"
            className="transition-all duration-300 hover:bg-white/20 hover:scale-105"
            variant="flat"
          >
            {x.label}
          </Chip>
        ))}</div>
      </div>

      { /* fixed-width waveform */}
      <div className="flex items-center shrink-0 px-2" style={{ width: waveformWidth }} onMouseDown={handleDrag}
           onClick={handlePlayClick}>
        <div className="w-full flex items-center justify-end">
          <WaveformVisualizer 
            audioSrc={blobUrlRef.current ?? null} 
            isPlaying={playing}
            currentTime={currentTime}
            duration={duration || sample.duration / 1000}
          />
        </div>
      </div>

      { /* other metadata */}
      <div className="flex gap-4 items-center shrink-0 pl-2" onMouseDown={handleDrag}
           onClick={handlePlayClick}
           style={{ cursor: "move" }}>
        {sample.key != null &&
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/50 border border-gray-700/50 
                         backdrop-blur-sm group-hover:bg-gray-700/50 group-hover:border-gray-600 
                         transition-all duration-300">
            <MusicalNoteIcon className="w-4 h-4 text-gray-300" />
            <span className="text-sm font-semibold">{`${sample.key.toUpperCase()}${getChordTypeDisplay(sample.chord_type)}`}</span>
          </div>
        }

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/50 border border-gray-700/50 
                       backdrop-blur-sm group-hover:bg-gray-700/50 group-hover:border-gray-600 
                       transition-all duration-300">
          <ClockCircleLinearIcon className="w-4 h-4 text-gray-300" />
          <span className="text-sm font-semibold">{`${(sample.duration / 1000).toFixed(2)}s`}</span>
        </div>

        {sample.bpm != null &&
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800/50 border border-gray-700/50 
                         backdrop-blur-sm group-hover:bg-gray-700/50 group-hover:border-gray-600 
                         transition-all duration-300">
            <ClockSquareBoldIcon className="w-4 h-4 text-gray-300" />
            <span className="text-sm font-semibold">{`${sample.bpm} BPM`}</span>
          </div>
        }

        {/* Download button */}
        <button
          onClick={(e) => handleWebDownload(e)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600/20 border border-blue-500/30 
                     hover:bg-blue-600/30 hover:border-blue-500/50 
                     transition-all duration-300 group/down relative overflow-hidden"
          data-draggable="false"
        >
          <span className="absolute inset-0 bg-blue-400/10 translate-x-[-100%] group-hover/down:translate-x-[0%] transition-transform duration-500" />
          <ArrowDownTrayIcon className="w-4 h-4 text-blue-400 group-hover/down:translate-y-0.5 transition-transform" />
          <span className="text-sm font-semibold text-blue-300">Download</span>
        </button>

        {/* Pitch/Speed preview controls */}
        <div className="flex items-center gap-2 ml-2 text-xs text-gray-400" onClick={(e)=>e.stopPropagation()}>
          <span>Rate</span>
          <input type="range" min={0.5} max={2} step={0.05} value={playbackRate} onChange={(e)=>{ const v = parseFloat((e.target as HTMLInputElement).value); setPlaybackRate(v); if(audioRef.current) audioRef.current.playbackRate = v * Math.pow(2, semitones/12); }} />
          <span className="tabular-nums">{playbackRate.toFixed(2)}x</span>
          <span>Pitch</span>
          <input type="range" min={-12} max={12} step={1} value={semitones} onChange={(e)=>{ const st = parseInt((e.target as HTMLInputElement).value); setSemitones(st); if(audioRef.current) audioRef.current.playbackRate = playbackRate * Math.pow(2, st/12); }} />
          <span className="tabular-nums">{semitones} st</span>
          <button className="px-2 py-1 rounded border border-gray-700 hover:bg-white/5" onClick={() => { setPlaybackRate(1); setSemitones(0); if(audioRef.current) audioRef.current.playbackRate = 1; }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

const propsAreEqual = (prev: any, next: any) => prev.sample.uuid === next.sample.uuid && prev.sample.updated_at === next.sample.updated_at;

export default memo(SampleListEntryBase, propsAreEqual);
