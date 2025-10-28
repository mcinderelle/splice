import { Chip, CircularProgress, Tooltip } from "@nextui-org/react";
import { ClockCircleLinearIcon, ClockSquareBoldIcon } from '@nextui-org/shared-icons'
import { MusicalNoteIcon, ArrowDownTrayIcon, HeartIcon, LinkIcon, PauseIcon, PlayIcon, StopIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
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
  { sample, ctx, onTagClick, waveformWidth = 360, compact = false, hoverAudition = false, hoverDelayMs = 150, isSelected = false }: {
    sample: SpliceSample,
    ctx: SamplePlaybackContext,
    onTagClick: TagClickHandler,
    waveformWidth?: number,
    compact?: boolean,
    hoverAudition?: boolean,
    hoverDelayMs?: number,
    isSelected?: boolean
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
  const [isFav, setIsFav] = useState(() => localStorage.getItem(`fav:${sample.uuid}`) === '1');

  const pack = sample.parents?.items?.[0] ?? { name: 'Unknown pack', permalink_base_url: '', files: [] } as any;
  const packCover = (pack.files?.find((x: any) => x.asset_file_type_slug == "cover_image")?.url) || "img/missing-cover.png";
  const isLoop = sample.asset_category_slug === 'loop';
  const displayName = (sample.name && sample.name.split('/').pop()) || sample.name || 'Unknown sample';
  const coverSize = compact ? 112 : 144;
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
      (audio as any).preservesPitch = cfg().preservePitch;
      (audio as any).mozPreservesPitch = cfg().preservePitch;
      (audio as any).webkitPreservesPitch = cfg().preservePitch;
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
      // Apply rate/pitch on load: if pitching, disable preservation so pitch shifts
      try {
        const pitching = semitones !== 0;
        (audio as any).preservesPitch = pitching ? false : cfg().preservePitch;
        (audio as any).mozPreservesPitch = pitching ? false : cfg().preservePitch;
        (audio as any).webkitPreservesPitch = pitching ? false : cfg().preservePitch;
      } catch {}
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
    try { (ctx as any).setCurrentUuid?.(null); } catch {}
  }

  function pausePlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlaying(false);
  }

  function toggleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !isFav;
    setIsFav(next);
    localStorage.setItem(`fav:${sample.uuid}`, next ? '1' : '0');
  }

  function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const file = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;
      navigator.clipboard.writeText(file.url);
    } catch {}
  }

  // Hover audition with delay
  const hoverTimerRef = useRef<number | null>(null);
  const onMouseEnter = () => {
    if (!hoverAudition) return;
    // Respect browser autoplay policy: require prior interaction
    if (!(window as any).__splicedd_interacted) return;
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
      try { ctx.cancellation?.(); } catch {}

      // If already playing, just pause
      if (playing) {
        pausePlayback();
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
        try {
          const pitching = semitones !== 0;
          (audio as any).preservesPitch = pitching ? false : cfg().preservePitch;
          (audio as any).mozPreservesPitch = pitching ? false : cfg().preservePitch;
          (audio as any).webkitPreservesPitch = pitching ? false : cfg().preservePitch;
        } catch {}
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

      // register cancellation to allow exclusive playback
      ctx.setCancellation(() => stop);
      try { (ctx as any).setCurrentUuid?.(sample.uuid); } catch {}
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

    // Web drag-and-drop to DAWs/browsers using DownloadURL hints
    ev.dataTransfer.effectAllowed = 'copy';

    const srcFile = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;
    const mp3Name = `${sanitizePath(sample.name)}.mp3`;
    const wavName = `${sanitizePath(sample.name)}.wav`;

    // Set a nicer drag image using the pack cover
    try {
      const img = new Image();
      img.src = packCover;
      img.onload = () => ev.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
    } catch {}

    // If we already have decoded audio, generate a WAV blob and drag that
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
          // Chrome/Edge: DownloadURL format mime:filename:url
          ev.dataTransfer.setData('DownloadURL', `audio/wav:${wavName}:${url}`);
          ev.dataTransfer.setData('text/uri-list', url);
          ev.dataTransfer.setData('text/plain', url);
        }).catch(() => {
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
      className={`card-subtle flex w-full px-4 md:px-6 py-2.5 md:py-3.5 gap-4 md:gap-6 rounded-lg ${compact ? 'min-h-[96px]' : 'min-h-[128px]'} flex-wrap md:flex-nowrap
                    items-center cursor-pointer select-none transition-all duration-300 group
                    ${playing ? 'ring-2 ring-emerald-400 bg-white/5 shadow-[0_0_36px_-6px_rgba(16,185,129,0.55)] backdrop-blur-sm' : ''}
                    ${!playing && isSelected ? 'ring-2 ring-sky-400/70 bg-white/5 shadow-[0_0_32px_-10px_rgba(56,189,248,0.6)]' : ''}
                    ${!playing ? 'hover:bg-white/5 hover:shadow-[0_0_30px_-12px_rgba(255,255,255,0.25)]' : ''}`}
    >
      { /* when loading, set the cursor for everything to a waiting icon */}
      {fgLoading && <style> {`* { cursor: wait }`} </style>}

      { /* sample pack (large square thumbnail left of controls) */}
      <div className="flex gap-3 items-center" style={{ width: coverSize }}>
        <Tooltip
          showArrow
          placement="right"
          delay={250}
          content={
          <a href={pack?.permalink_base_url ? `https://splice.com/sounds/labels/${pack.permalink_base_url}` : '#'} target="_blank" rel="noopener noreferrer"
             className="flex flex-col gap-3 p-4 animate-scaleIn bg-black/80 rounded-lg shadow-xl border border-white/10 hover:bg-black/70">
            <img src={packCover} alt={pack.name} width={128} height={128} className="rounded-lg" />
            <h1 className="font-semibold text-white">{pack.name}</h1>
            <div className="text-xs text-gray-300 flex gap-3 flex-wrap">
              {sample.key && <span>Key: <b>{sample.key.toUpperCase()}</b></span>}
              {sample.bpm && <span>BPM: <b>{sample.bpm}</b></span>}
              {sample.bpm && <span>Preview BPM: <b>{(sample.bpm * effectiveRate).toFixed(1)}</b></span>}
              <span>Dur: <b>{(sample.duration/1000).toFixed(2)}s</b></span>
              <span>Speed: <b>{effectiveRate.toFixed(2)}x</b></span>
              <span>Pitch: <b>{semitones} st</b></span>
            </div>
          </a>
        }>
          <a href={pack?.permalink_base_url ? `https://splice.com/sounds/labels/${pack.permalink_base_url}` : '#'} target="_blank" 
             className="hover:opacity-90 transition-all duration-300"
             onClick={(e) => e.stopPropagation()}>
            <img src={packCover} alt={pack.name} width={coverSize} height={coverSize} className="rounded-md object-cover shadow-lg hover:scale-[1.03] transition-transform duration-300" />
          </a>
        </Tooltip>

        <div className="flex items-center gap-2 w-28 md:w-32 justify-start">
          <button onClick={handlePlayClick}
               className={`play-button cursor-pointer w-10 h-10 md:w-12 md:h-12 rounded-full border flex items-center justify-center 
                          transition-all duration-300 backdrop-blur-sm focus:outline-none focus:ring-2
                          ${playing ? 'border-emerald-400/50 bg-emerald-300/10 focus:ring-emerald-400/40' : 'border-white/30 bg-white/5 hover:bg-white/10 focus:ring-white/40'}`}
               aria-label={playing ? "Pause sample" : "Play sample"}>
            {fgLoading ? (
              <span aria-label="Loading sample..." className="inline-block w-5 h-5 rounded-full border-2 border-white/40 border-t-transparent animate-spin" />
            ) : playing ? (
              <PauseIcon className="w-5 h-5 text-white" />
            ) : (
              <PlayIcon className="w-5 h-5 text-white" />
            )}
          </button>
          {playing && (
            <button onClick={(e)=>{ e.stopPropagation(); stop(); }}
                 className={`cursor-pointer w-10 h-10 md:w-12 md:h-12 rounded-full border flex items-center justify-center 
                            transition-all duration-300 backdrop-blur-sm focus:outline-none focus:ring-2
                            ${'border-rose-400/50 bg-rose-300/10 hover:bg-rose-300/20 focus:ring-rose-400/40'}`}
                 aria-label="Stop sample">
              <StopIcon className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>

      { /* sample name + tags (no inline thumbnail) */}
      <div className="grow overflow-hidden min-w-0" 
           onMouseDown={handleDrag}
           draggable={typeof window !== 'undefined' && !('__TAURI__' in window)}
           onDragStart={handleWebDragStart}
           onClick={handlePlayClick}
           style={{ cursor: "move" }}>
        <div className="flex-1 min-w-[300px] flex gap-3 md:gap-4 items-center overflow-hidden group-hover:translate-x-1 transition-transform duration-300">
          <a
            href={pack?.permalink_base_url ? `https://splice.com/sounds/labels/${pack.permalink_base_url}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e)=>e.stopPropagation()}
            className="font-bold text-[15px] text-white group-hover:text-white transition-colors truncate underline-offset-2 hover:underline flex-1 min-w-0 pr-2"
            title={displayName}
          >
            {/** highlight query terms if present in URL param q */}
            {(() => {
              const params = new URLSearchParams(window.location.search);
              const q = (params.get('q') || '').trim();
              const name = displayName as string;
              if (!q) return name || 'Unknown sample';
              const idx = (name || '').toLowerCase().indexOf(q.toLowerCase());
              if (idx === -1) return name || 'Unknown sample';
              const before = name.slice(0, idx);
              const mid = name.slice(idx, idx + q.length);
              const after = name.slice(idx + q.length);
              return (<>
                {before}
                <span className="bg-white/20 rounded px-1">{mid}</span>
                {after}
              </>);
            })()}
          </a>
          <span
            title={isLoop ? 'Loop' : 'One‑shot'}
            className={`text-xs px-3 py-1 rounded-full whitespace-nowrap border ${isLoop ? 'bg-green-900/30 border-green-600/30 text-green-300' : 'bg-blue-900/30 border-blue-600/30 text-blue-300'}`}
          >{isLoop ? 'Loop' : 'One‑shot'}</span>

          {/* pack name badge only */}
          <div className="flex items-center gap-2 ml-2 shrink-0">
            {pack?.name && (
              <a
                href={pack?.permalink_base_url ? `https://splice.com/sounds/labels/${pack.permalink_base_url}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e)=>e.stopPropagation()}
                className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 whitespace-nowrap"
                title={`Open pack: ${pack.name}`}
                data-draggable="false"
              >
                {pack.name}
              </a>
            )}
          </div>

          {/* quick actions */}
          <div className="ml-auto flex items-center gap-2 pr-1">
            <button
              onClick={toggleFavorite}
              aria-label={isFav ? 'Unfavorite' : 'Favorite'}
              className={`p-1.5 rounded-lg border transition-all duration-300 backdrop-blur-md ${isFav ? 'border-pink-400/60 bg-pink-500/20 shadow-[0_8px_24px_-8px_rgba(236,72,153,0.6)] scale-[1.05]' : 'border-gray-700/80 bg-white/5 hover:bg-white/10'}`}
              data-draggable="false"
            >
              <HeartIcon className={`w-4 h-4 ${isFav ? 'text-pink-300 drop-shadow-[0_0_6px_rgba(236,72,153,0.75)]' : 'text-gray-300'}`} />
            </button>
            {/* copy link removed */}
          </div>
        </div>

        {errorMessage && !playing && (
          <div className="mt-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        {/* details directly under name (key updates with pitch, BPM updates with speed) */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {sample.key != null && (
            (() => {
              const keys = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]; 
              const base = (sample.key || "").toUpperCase();
              const idx = keys.indexOf(base);
              const shifted = idx >= 0 ? keys[(idx + ((semitones % 12) + 12) % 12) % 12] : base;
              const label = `${shifted}${getChordTypeDisplay(sample.chord_type)}`;
              const changed = semitones !== 0;
              return (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${changed ? 'bg-yellow-500/20 border-yellow-400/40 shadow-[0_0_18px_rgba(250,204,21,0.45)]' : 'bg-gray-800/50 border-gray-700/50'} ml-0.5`}>
                  <MusicalNoteIcon className={`w-3.5 h-3.5 ${changed ? 'text-yellow-300' : 'text-gray-300'}`} />
                  <span className={`text-xs font-semibold ${changed ? 'text-yellow-200' : ''}`}>{label}</span>
                </div>
              );
            })()
          )}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-800/50 border border-gray-700/50">
            <ClockCircleLinearIcon className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-xs font-semibold">{`${(sample.duration / 1000).toFixed(2)}s`}</span>
          </div>
          {sample.bpm != null && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-800/50 border border-gray-700/50">
              <ClockSquareBoldIcon className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-xs font-semibold">{`${sample.bpm} BPM`}</span>
            </div>
          )}
          {(() => {
            try {
              if (sample.bpm == null) return null;
              const base = Number(sample.bpm) || 0;
              const nb = Math.round(base * playbackRate);
              if (!isFinite(nb) || nb <= 0 || Math.abs(playbackRate - 1) < 1e-3) return null;
              return (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-sky-500/15 border-sky-400/40 shadow-[0_0_18px_rgba(56,189,248,0.45)]">
                  <ClockSquareBoldIcon className="w-3.5 h-3.5 text-sky-300" />
                  <span className="text-xs font-semibold text-sky-200">{`${nb} BPM`}</span>
                </div>
              );
            } catch { return null; }
          })()}
        </div>

        {/* tags */}
        <div className="flex gap-2 mt-2 flex-wrap">{sample.tags.map(x => (
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

      { /* flexible waveform - expands to consume free space */}
      <div className="flex items-center px-2 flex-1 min-w-[240px]" onMouseDown={handleDrag}
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

      { /* actions row (download + preview controls) */}
      <div className="flex gap-2 md:gap-3 items-center shrink-0 ml-2 flex-wrap md:flex-nowrap" onMouseDown={handleDrag}
           onClick={handlePlayClick}
           style={{ cursor: "move" }}>
        {/* Download button */}
        <button
          onClick={(e) => {
            if ((window as any).__TAURI__) {
              // Desktop app: save to configured sampleDir
              e.stopPropagation();
              (async () => {
                try {
                  setFgLoading(true);
                  await ensureAudioDecoded();
                  const actx = new AudioContext();
                  const samples = await actx.decodeAudioData(decodedSampleRef.current!.buffer as any);
                  const channels: Float32Array[] = [];
                  for (let i = 0; i < samples.numberOfChannels; i++) channels.push(samples.getChannelData(i));
                  const wavBuffer = wav.encode(channels as any, { bitDepth: 16, sampleRate: samples.sampleRate });
                  const { writeSampleFile } = await import('../../native');
                  const filePath = `${sanitizePath(pack.name)}/${sanitizePath(sample.name)}.wav`;
                  await writeSampleFile(cfg().sampleDir, filePath, wavBuffer as any);
                  setFgLoading(false);
                  notify('success', 'Saved to samples folder');
                } catch (err) {
                  console.error(err);
                  setFgLoading(false);
                  notify('error', 'Save failed');
                }
              })();
            } else {
              handleWebDownload(e);
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600/20 border border-blue-500/30 
                     hover:bg-blue-600/30 hover:border-blue-500/50 
                     transition-all duration-300 group/down relative overflow-hidden"
          data-draggable="false"
        >
          <span className="absolute inset-0 bg-blue-400/10 translate-x-[-100%] group-hover/down:translate-x-[0%] transition-transform duration-500" />
          <ArrowDownTrayIcon className="w-4 h-4 text-blue-400 group-hover/down:translate-y-0.5 transition-transform" />
          <span className="text-xs font-semibold text-blue-300">Download</span>
        </button>

        {/* Speed/Pitch preview controls */}
        <div className="flex items-center gap-2 ml-2 text-[11px] text-gray-400" onClick={(e)=>e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span>Speed</span>
            <input aria-label="Speed" type="range" min={0.5} max={2} step={0.05} value={playbackRate} onChange={(e)=>{ const v = parseFloat((e.target as HTMLInputElement).value); setPlaybackRate(v); if(audioRef.current) audioRef.current.playbackRate = v * Math.pow(2, semitones/12); }} />
            <span className="tabular-nums">{playbackRate.toFixed(2)}x</span>
            {sample.bpm != null && (
              <span className="tabular-nums text-sky-300 bg-sky-500/10 rounded px-2 py-0.5 border border-sky-400/30 shadow-[0_0_12px_rgba(56,189,248,0.35)]">
                {(() => { try { const nb = Math.round((Number(sample.bpm)||0) * playbackRate); return isFinite(nb)&&nb>0? `${nb} BPM` : ''; } catch { return ''; } })()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>Pitch</span>
            <button aria-label="Pitch down" className="px-2 py-1 rounded border border-gray-700 hover:bg-white/5" onClick={() => { const st = Math.max(-12, semitones - 1); setSemitones(st); if(audioRef.current){ try{ (audioRef.current as any).preservesPitch = st !== 0 ? false : cfg().preservePitch; (audioRef.current as any).mozPreservesPitch = st !== 0 ? false : cfg().preservePitch; (audioRef.current as any).webkitPreservesPitch = st !== 0 ? false : cfg().preservePitch; } catch{} audioRef.current.playbackRate = playbackRate * Math.pow(2, st/12); } }}>-</button>
            <span className="tabular-nums w-10 text-center">{semitones > 0 ? `+${semitones}` : semitones} st</span>
            <button aria-label="Pitch up" className="px-2 py-1 rounded border border-gray-700 hover:bg-white/5" onClick={() => { const st = Math.min(12, semitones + 1); setSemitones(st); if(audioRef.current){ try{ (audioRef.current as any).preservesPitch = st !== 0 ? false : cfg().preservePitch; (audioRef.current as any).mozPreservesPitch = st !== 0 ? false : cfg().preservePitch; (audioRef.current as any).webkitPreservesPitch = st !== 0 ? false : cfg().preservePitch; } catch{} audioRef.current.playbackRate = playbackRate * Math.pow(2, st/12); } }}>+</button>
          </div>
          <button className="px-2 py-1 rounded border border-gray-700 hover:bg-white/5" onClick={() => { setPlaybackRate(1); setSemitones(0); if(audioRef.current){ try{ (audioRef.current as any).preservesPitch = cfg().preservePitch; (audioRef.current as any).mozPreservesPitch = cfg().preservePitch; (audioRef.current as any).webkitPreservesPitch = cfg().preservePitch; } catch{} audioRef.current.playbackRate = 1; } }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

const propsAreEqual = (prev: any, next: any) => prev.sample.uuid === next.sample.uuid && prev.sample.updated_at === next.sample.updated_at;

export default memo(SampleListEntryBase, propsAreEqual);
