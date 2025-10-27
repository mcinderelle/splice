import { Chip, CircularProgress, Tooltip } from "@nextui-org/react";
import { ClockCircleLinearIcon, ClockSquareBoldIcon } from '@nextui-org/shared-icons'
import { MusicalNoteIcon } from "@heroicons/react/20/solid";
import { PlayIcon, StopIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import * as wav from "node-wav";
import { httpFetch } from "../../utils/httpFetch";
import { cfg } from "../../config";
import { SamplePlaybackContext } from "../playback";
import { SpliceTag } from "../../splice/entities";
import { SpliceSample } from "../../splice/api";
import { decodeSpliceAudio } from "../../splice/decoder";

const getChordTypeDisplay = (type: string | null) =>
  type == null ? "" : type == "major" ? " Major" : " Minor";

export type TagClickHandler = (tag: SpliceTag) => void;

/**
 * Provides a view describing a Splice sample.
 */
export default function SampleListEntry(
  { sample, ctx, onTagClick }: {
    sample: SpliceSample,
    ctx: SamplePlaybackContext,
    onTagClick: TagClickHandler
  }
) {
  const [fgLoading, setFgLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audio = document.createElement("audio");

  const pack = sample.parents.items[0];
  const packCover = pack
    ? pack.files.find(x => x.asset_file_type_slug == "cover_image")?.url
    : "img/missing-cover.png";

  let decodedSample: Uint8Array | null = null;

  let fetchAhead: Promise<any> | null = null;
  function startFetching() {
    if (fetchAhead != null)
      return;

    const file = sample.files.find(x => x.asset_file_type_slug == "preview_mp3")!;

    fetchAhead = httpFetch(file.url, {
      method: "GET",
      responseType: 'Binary'
    });
  }

  audio.onended = () => setPlaying(false);

  function stop() {
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
  }

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

      // Load and play
      if (audio.src == "") {
        setFgLoading(true);
        await ensureAudioDecoded();
        setFgLoading(false);

        audio.src = URL.createObjectURL(
          new Blob([decodedSample! as any], { "type": "audio/mpeg" })
        );
      }

      await audio.play();
      setPlaying(true);

      ctx.setCancellation(() => stop);
    } catch (error) {
      console.error("Error playing sample:", error);
      setFgLoading(false);
      setPlaying(false);
    }
  }

  async function ensureAudioDecoded() {
    if (decodedSample != null)
      return;

    if (fetchAhead == null) {
      startFetching();
    }

    try {
      const resp = await fetchAhead;
      decodedSample = decodeSpliceAudio(new Uint8Array(resp!.data));
    } catch (error) {
      console.error("Error decoding audio:", error);
      throw error;
    }
  }

  const sanitizePath = (x: string) => x.replace(/[<>:"|?* ]/g, "_");

  async function handleDrag(ev: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    try {
      // Only support drag in Tauri mode
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
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

      // Import Tauri modules dynamically
      const { path } = await import('@tauri-apps/api');
      const { startDrag } = await import('@crabnebula/tauri-plugin-drag');
      const { checkFileExists, createPlaceholder, writeSampleFile } = await import('../../native');

    const dragParams = {
      item: [await path.join(cfg().sampleDir, samplePath)],
      icon: ""
    };

    setFgLoading(true);
    await ensureAudioDecoded();

    if (!await checkFileExists(cfg().sampleDir, samplePath)) {
      if (cfg().placeholders) {
        await createPlaceholder(cfg().sampleDir, samplePath);
        startDrag(dragParams);
      }

      const actx = new AudioContext();

      const samples = await actx.decodeAudioData(decodedSample!.buffer as any);
      const channels: Float32Array[] = [];

      if (samples.length < 60 * 44100) {
        for (let i = 0; i < samples.numberOfChannels; i++) {
          const chan = samples.getChannelData(i);

          const start = 1200;
          const end = ((sample.duration / 1000) * samples.sampleRate) + start;

          channels.push(chan.subarray(start, end));
        }
      } else {
        // processing big samples may result in memory allocation errors (it sure did for me!!)
        console.warn(`big boi detected of ${samples.length} samples - not pre-processing!`);
      }

      await writeSampleFile(cfg().sampleDir, samplePath, wav.encode(channels as any, {
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
      setFgLoading(false);
    }
  }

  return (
    <div onMouseOver={startFetching}
      className={`card-subtle flex w-full px-6 py-5 gap-6 rounded-lg
                    items-center hover-lift cursor-pointer select-none transition-all duration-300 group`}
    >
      { /* when loading, set the cursor for everything to a waiting icon */}
      {fgLoading && <style> {`* { cursor: wait }`} </style>}

      { /* sample pack */}
      <div className="flex gap-3 min-w-24 items-center">
        <Tooltip content={
          <div className="flex flex-col gap-3 p-4 animate-scaleIn bg-black rounded-lg shadow-xl">
            <img src={packCover} alt={pack.name} width={128} height={128} className="rounded-lg" />
            <h1 className="font-semibold text-white">{pack.name}</h1>
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
      <div className="grow" onMouseDown={handleDrag}
           onClick={handlePlayClick}
           style={{ cursor: "move" }}>
        <div className="flex gap-3 items-center max-w-[50vw] overflow-clip group-hover:translate-x-1 transition-transform duration-300">
          <span className="font-bold text-base group-hover:text-white transition-colors">{sample.name.split("/").pop()}</span>
          <span className="text-gray-400 text-xs px-3 py-1 bg-gray-800 rounded-full">{sample.asset_category_slug}</span>
        </div>

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

      { /* other metadata */}
      <div className="flex gap-4 items-center" onMouseDown={handleDrag}
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
      </div>
    </div>
  );
}
