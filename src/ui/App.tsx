import { useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Input, Modal, Pagination, Popover, PopoverContent, PopoverTrigger, Radio, RadioGroup, Select, SelectItem, useDisclosure } from "@nextui-org/react";
import { SearchIcon, ChevronDownIcon } from '@nextui-org/shared-icons'
import { WrenchIcon, QuestionMarkCircleIcon, InformationCircleIcon } from "@heroicons/react/20/solid";
import { cfg } from "../config";
import { GRAPHQL_URL, SpliceSample, createSearchRequest, SpliceSearchResponse } from "../splice/api";
import { ChordType, MusicKey, SpliceSampleType, SpliceSortBy, SpliceTag } from "../splice/entities";
import { httpFetch, type HttpFetchJsonResult } from "../utils/httpFetch";
import React from "react";
import SampleListEntry from "./components/SampleListEntry";
import VirtualList from "./components/VirtualList";
import InfiniteResults from "./components/InfiniteResults";
// removed duplicate React import
import SettingsModalContent from "./components/SettingsModalContent";
import KeyScaleSelection from "./components/KeyScaleSelection";
import HelpModal from "./components/HelpModal";
import { SamplePlaybackCancellation, SamplePlaybackContext } from "./playback";
import { ToastProvider } from "./toast";
import { useDiagnostics } from "./diagnostics";

function App() {
  const diagnostics = useDiagnostics();
  const settings = useDisclosure({
    defaultOpen: !cfg().configured
  });
  
  const help = useDisclosure();

  const [bpmType, setBpmType] = useState<"exact" | "range">("exact");
  const [bpm, setBpm] = useState<{
    minBpm?: number,
    maxBpm?: number,
    bpm?: string
  }>();

  const [query, setQuery] = useState("");

  const [results, setResults] = useState<SpliceSample[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const resultContainer = useRef<HTMLDivElement | null>(null);

  const [queryTimer, setQueryTimer] = useState<number | null>(null);
  useEffect(() => {
    return () => { if (queryTimer != null) { window.clearTimeout(queryTimer); } };
  }, [queryTimer]);

  const [sortBy, setSortBy] = useState<SpliceSortBy>("relevance");
  const [sampleType, setSampleType] = useState<SpliceSampleType | "any">("any")

  const [knownInstruments, setKnownInstruments] = useState<{name: string, uuid: string}[]>([]);
  const [knownGenres, setKnownGenres] = useState<{name: string, uuid: string}[]>([]);
  const [knownTags, setKnownTags] = useState<{name: string, uuid: string}[]>([]);

  const [instruments, setInstruments] = useState(new Set<string>([]));
  const [genres, setGenres] = useState(new Set<string>([]));
  let [tags, setTags] = useState<SpliceTag[]>([]);

  const [musicKey, setMusicKey] = useState<MusicKey | null>(null);
  const [chordType, setChordType] = useState<ChordType | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchLoading, setSearchLoading] = useState(false);
  const [netStatus, setNetStatus] = useState<string | null>(null);
  const latestSearchSeq = useRef(0);
  const [compactMode, setCompactMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const v = localStorage.getItem('ui:sidebarOpen');
    return v == null ? false : v === '1';
  });
  useEffect(()=>{ try{ localStorage.setItem('ui:sidebarOpen', sidebarOpen ? '1':'0'); } catch{} }, [sidebarOpen]);
  const [hoverAudition, setHoverAudition] = useState(false);
  const [hoverDelayMs, setHoverDelayMs] = useState(150);
  const [autoPlayOnNavigate, setAutoPlayOnNavigate] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [waveformWidth, setWaveformWidth] = useState(cfg().waveformWidth);
  const [useInfinite, setUseInfinite] = useState<boolean>(() => {
    try { const v = localStorage.getItem('ui:infiniteScroll'); return v ? v === '1' : (cfg().infiniteScroll ?? false); } catch { return cfg().infiniteScroll ?? false; }
  });
  useEffect(()=>{ try{ localStorage.setItem('ui:infiniteScroll', useInfinite ? '1':'0'); } catch{} }, [useInfinite]);
  const [minDuration, setMinDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(30);
  const [minBpm, setMinBpm] = useState(0);
  const [maxBpm, setMaxBpm] = useState(999);
  const [sortKeyProximity, setSortKeyProximity] = useState(false);
  // Controlled open states for intuitive close-on-select UX
  const [instOpen, setInstOpen] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [keyPopOpen, setKeyPopOpen] = useState(false);
  const [bpmPopOpen, setBpmPopOpen] = useState(false);

  // Inline SVG badge for instruments (unique shapes + colors)
  const toTitle = (s: string) => s.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().replace(/\w\S*/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const instrumentSvg = (name: string) => {
    const n = name.toLowerCase();
    const wrap = (path: React.ReactNode, color: string) => (
      <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:20, height:20, borderRadius:9999, background: 'linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.2))', boxShadow:'inset 0 1px 1px rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.35)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {path}
        </svg>
      </span>
    );
    if (n.includes('piano') || n.includes('keys') || n.includes('keyboard')) return wrap(<>
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <line x1="6" y1="5" x2="6" y2="19"/>
      <line x1="10" y1="5" x2="10" y2="19"/>
      <line x1="14" y1="5" x2="14" y2="19"/>
      <line x1="18" y1="5" x2="18" y2="19"/>
    </>, '#e5e7eb');
    if (n.includes('guitar')) return wrap(<>
      <circle cx="9" cy="15" r="5"/>
      <path d="M14 10l7-7"/>
      <path d="M18 3l3 3"/>
    </>, '#f59e0b');
    if (n.includes('bass')) return wrap(<>
      <path d="M6 8c4-3 8 1 6 5"/>
      <circle cx="16" cy="14" r="2"/>
      <circle cx="12" cy="16" r="1.5"/>
    </>, '#10b981');
    if (n.includes('drum') || n.includes('percussion') || n.includes('kit')) return wrap(<>
      <ellipse cx="12" cy="8" rx="8" ry="3"/>
      <path d="M4 8v6c0 1.7 3.6 3 8 3s8-1.3 8-3V8"/>
    </>, '#ef4444');
    if (n.includes('synth') || n.includes('lead')) return wrap(<>
      <rect x="4" y="6" width="16" height="12" rx="2"/>
      <path d="M7 10h2M11 10h2M15 10h2"/>
    </>, '#8b5cf6');
    if (n.includes('pad')) return wrap(<>
      <rect x="5" y="5" width="14" height="14" rx="3"/>
      <path d="M7 9h10M7 13h10"/>
    </>, '#22c55e');
    if (n.includes('pluck') || n.includes('arp')) return wrap(<>
      <path d="M4 18l8-12 8 12"/>
      <circle cx="12" cy="14" r="2"/>
    </>, '#06b6d4');
    if (n.includes('string')) return wrap(<>
      <path d="M6 4l12 16"/>
      <circle cx="8" cy="18" r="2"/>
      <circle cx="16" cy="6" r="2"/>
    </>, '#f97316');
    if (n.includes('brass') || n.includes('trumpet') || n.includes('sax')) return wrap(<>
      <path d="M4 12h8l5 3v-6l-5 3H4z"/>
    </>, '#fde047');
    if (n.includes('vocal') || n.includes('voice')) return wrap(<>
      <circle cx="12" cy="8" r="3"/>
      <path d="M12 11v6"/>
      <path d="M8 20h8"/>
    </>, '#38bdf8');
    if (n.includes('fx') || n.includes('effect')) return wrap(<>
      <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"/>
    </>, '#22d3ee');
    return wrap(<>
      <path d="M3 12h18"/>
      <circle cx="12" cy="12" r="3"/>
    </>, '#94a3b8');
  };

  useEffect(() => {
    const onRetry = (e: any) => setNetStatus(`Retrying… (${e?.detail?.attempt})`);
    const onSuccess = () => setNetStatus(null);
    const onError = (e: any) => {
      setNetStatus('Network error');
      diagnostics.record('Network error', e?.detail);
    };
    // Mark first user interaction to enable hover-audition (autoplay guard)
    const markInteract = () => { (window as any).__splicedd_interacted = true; };
    window.addEventListener('pointerdown', markInteract, { once: true });
    window.addEventListener('keydown', markInteract, { once: true });
    window.addEventListener('httpFetch:retry', onRetry as any);
    window.addEventListener('httpFetch:success', onSuccess as any);
    window.addEventListener('httpFetch:error', onError as any);
    return () => {
      window.removeEventListener('httpFetch:retry', onRetry as any);
      window.removeEventListener('httpFetch:success', onSuccess as any);
      window.removeEventListener('httpFetch:error', onError as any);
      window.removeEventListener('pointerdown', markInteract);
      window.removeEventListener('keydown', markInteract);
    }
  }, []);

  useEffect(() => {
    if (!netStatus) return;
    const timer = setTimeout(() => setNetStatus(null), 1200);
    return () => clearTimeout(timer);
  }, [netStatus]);

  // Refresh search when filters change
  useEffect(() => {
    // smooth update on filter changes
    const t = window.setTimeout(() => updateSearch(query), 50);
    return () => window.clearTimeout(t);
  }, [
    sortBy, bpm, bpmType, sampleType,
    instruments, genres, currentPage,
    musicKey, chordType
  ]);

  // Initialize query from URL or localStorage and keep URL in sync
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = (params.get('q') ?? localStorage.getItem('lastQuery') ?? '').trim();
    setQuery(initial);
    // kick an initial search even if empty to hydrate constraints
    updateSearch(initial, true, true);
    // no cleanup needed
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query) {
      params.set('q', query);
      localStorage.setItem('lastQuery', query);
    } else {
      params.delete('q');
      localStorage.removeItem('lastQuery');
    }
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', url);
  }, [query]);

  const [smplCancellation, smplSetCancellation] = useState<SamplePlaybackCancellation | null>(null);
  const [currentPlayingUuid, setCurrentPlayingUuid] = useState<string | null>(null);
  const pbCtx: SamplePlaybackContext = {
    cancellation: smplCancellation,
    setCancellation: smplSetCancellation,
    currentUuid: currentPlayingUuid,
    setCurrentUuid: setCurrentPlayingUuid
  }

  // Simple keyboard navigation across results
  const focusedIndexRef = useRef<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!results.length) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusedIndexRef.current = Math.min(results.length - 1, focusedIndexRef.current + 1);
        scrollIntoView(focusedIndexRef.current);
        setSelectedIndex(focusedIndexRef.current);
        if (autoPlayOnNavigate) triggerRowPlay(focusedIndexRef.current);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusedIndexRef.current = Math.max(0, focusedIndexRef.current - 1);
        scrollIntoView(focusedIndexRef.current);
        setSelectedIndex(focusedIndexRef.current);
        if (autoPlayOnNavigate) triggerRowPlay(focusedIndexRef.current);
      } else if (e.key === 'Enter' && focusedIndexRef.current >= 0) {
        e.preventDefault();
        // Programmatically trigger click on the focused row
        const el = document.querySelector(`[data-sample-idx="${focusedIndexRef.current}"]`) as HTMLElement | null;
        el?.click();
        setSelectedIndex(focusedIndexRef.current);
      }
    };
    const scrollIntoView = (idx: number) => {
      const el = document.querySelector(`[data-sample-idx="${idx}"]`);
      (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (el) {
        (el as HTMLElement).classList.add('ring-2','ring-sky-400/70','shadow-[0_0_32px_-10px_rgba(56,189,248,0.6)]');
        setTimeout(() => (el as HTMLElement).classList.remove('ring-2','ring-sky-400/70','shadow-[0_0_32px_-10px_rgba(56,189,248,0.6)]'), 450);
      }
    };
    const triggerRowPlay = (idx: number) => {
      const el = document.querySelector(`[data-sample-idx="${idx}"] button[aria-label]`) as HTMLButtonElement | null;
      el?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, autoPlayOnNavigate]);

  // Keyboard shortcuts for musicians
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input
      const activeElement = document.activeElement;
      const isTyping = activeElement?.tagName === 'INPUT' || 
                       activeElement?.tagName === 'TEXTAREA';
      
      // Space/P to toggle play/pause on selected/focused row
      if ((e.code === 'Space' || e.key.toLowerCase() === 'p') && !isTyping) {
        e.preventDefault();
        const idx = (selectedIndex != null && selectedIndex >= 0)
          ? selectedIndex
          : (focusedIndexRef.current >= 0 ? focusedIndexRef.current : -1);
        if (idx >= 0) {
          const el = document.querySelector(`[data-sample-idx="${idx}"] button.play-button`) as HTMLButtonElement | null;
          el?.click();
        }
      }
      
      // S to stop
      if ((e.key.toLowerCase() === 's') && !isTyping) {
        e.preventDefault();
        const idx = (selectedIndex != null && selectedIndex >= 0)
          ? selectedIndex
          : (focusedIndexRef.current >= 0 ? focusedIndexRef.current : -1);
        if (idx >= 0) {
          const stopBtn = document.querySelector(`[data-sample-idx="${idx}"] button[aria-label="Stop sample"]`) as HTMLButtonElement | null;
          if (stopBtn) {
            stopBtn.click();
          } else {
            pbCtx.cancellation?.();
          }
        } else {
          pbCtx.cancellation?.();
        }
      }
      // Esc to clear search
      if (e.key === 'Escape' && !isTyping) {
        setQuery("");
      }
      
      // / to focus search
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        const searchInput = document.querySelector('input[aria-label="Search for samples"]') as HTMLInputElement;
        searchInput?.focus();
        searchInput?.select();
      }
      
      // Ctrl/Cmd + , to open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        settings.onOpen();
      }
      
      // H to open help
      if (e.key === 'h' && !isTyping) {
        e.preventDefault();
        help.onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pbCtx, settings, help, setQuery, selectedIndex]);

  function ensureContraintsGathered() {
    if (knownInstruments.length == 0 || knownGenres.length == 0) {
      updateSearch("", false, true);
    }
  }

  function changePage(n: number) {
    setCurrentPage(n);
    resultContainer.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  function handleSearchInput(ev: React.ChangeEvent<HTMLInputElement>) {
    const next = ev.target.value;
    setQuery(next);
    if (queryTimer != null) { window.clearTimeout(queryTimer); }
    // Debounce, but guard against stale queries
    setSearchLoading(true);
    const scheduledQuery = next;
    const selfTimer = window.setTimeout(() => {
      if (scheduledQuery === (document.querySelector('input[aria-label="Search for samples"]') as HTMLInputElement)?.value) {
        updateSearch(scheduledQuery, true);
      }
    }, 250);
    setQueryTimer(selfTimer);
  }

  function handleSearchKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key == "Enter") {
      updateSearch(query, true);
    }
  }

  function updateTagState(selectedKeys: Set<string>) {
    tags = tags.filter(x => Array.from(selectedKeys).some(y => x.uuid == y));
    setTags(tags);
    updateSearch(query, true);
  }

  function handleTagClick(tag: SpliceTag) {
    if (tags.some(x => x.uuid == tag.uuid)) {
      return;
    }

    tags = [...tags, tag];
    setTags(tags);
    updateSearch(query, true);
  }

  async function updateSearch(newQuery: string, resetPage = false, allowEmpty = false) {
      const seq = ++latestSearchSeq.current;
      try {
        const q = newQuery.trim();
        if (q.length === 0 && !allowEmpty) {
          setResults([]);
          setResultCount(0);
          return;
        }
        const payload = createSearchRequest(newQuery);
        payload.variables.sort = sortBy;
        if (sortBy == "random") {
          payload.variables.random_seed = Math.floor(Math.random() * 10000000000).toString();
        }

        payload.variables.tags = tags.map(x => x.uuid);
        
        if (bpmType == "exact") {
          payload.variables.bpm = bpm?.bpm;
        } else {
          payload.variables.min_bpm = bpm?.minBpm;
          payload.variables.max_bpm = bpm?.maxBpm;
        }

        if (sampleType != "any") {
          payload.variables.asset_category_slug = sampleType;
        }

        payload.variables.tags.push(...instruments);
        payload.variables.tags.push(...genres);

        payload.variables.chord_type = chordType ?? undefined;
        payload.variables.key = musicKey ?? undefined;
        
        payload.variables.page = resetPage ? 1 : currentPage;

        setSearchLoading(true);

        const resp = await httpFetch<SpliceSearchResponse>(GRAPHQL_URL, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: payload,
          responseType: 'Json'
        });

        pbCtx.cancellation?.(); // stop any sample that's currently playing

        // Ignore out-of-date responses
        if (seq !== latestSearchSeq.current) return;
        const data = (resp as HttpFetchJsonResult<SpliceSearchResponse>).data.data.assetsSearch;

        // Client-side exact-match boost: move exact name matches to top
        const ql = q.toLowerCase();
        const boosted = [...data.items].sort((a: any, b: any) => {
          const an = (a.name.split('/').pop() || '').toLowerCase();
          const bn = (b.name.split('/').pop() || '').toLowerCase();
          const ae = an === ql ? 1 : (an.includes(ql) ? 0.5 : 0);
          const be = bn === ql ? 1 : (bn.includes(ql) ? 0.5 : 0);
          return be - ae;
        });
        setResults(boosted);
        setResultCount(data.response_metadata.records);

        setCurrentPage(resetPage ? 1 : data.pagination_metadata.currentPage);
        setTotalPages(data.pagination_metadata.totalPages);

        function findConstraints(name: "Genre" | "Instrument" | "Tag") {
          return data.tag_summary.map((x: any) => x.tag)
            .filter((x: any) => x.taxonomy.name == name)
            .map((x: any) => ({ name: x.label, uuid: x.uuid }));
        }

        setKnownGenres(findConstraints("Genre"));
        setKnownInstruments(findConstraints("Instrument"));
        setKnownTags(findConstraints("Tag"));
      } catch (error) {
        console.error("Error updating search:", error);
        // Keep last results instead of flashing empty UI; show netStatus banner
        setNetStatus('Temporary search error');
      } finally {
        setSearchLoading(false);
      }
  }

  return (
    <ToastProvider>
    <main className="flex flex-col gap-4 m-6 h-screen animate-fadeIn min-h-0">
      {/* Header with Splice Logo */}
      <div className="flex items-center justify-between animate-slideIn">
        <div className="flex items-center gap-4">
          <svg className="w-12 h-12 text-white" viewBox="0 0 240 73" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path clipRule="evenodd" d="M16.983 46.2017C17.3267 46.1664 17.5967 45.8755 17.5967 45.5227C17.5967 45.3334 17.5206 45.1628 17.3965 45.0388L16.5621 44.2036C14.5626 42.2035 14.5626 38.9599 16.5621 36.9605L35.3004 18.208C37.1539 16.354 38.2999 13.793 38.2999 10.9634C38.2999 5.30569 33.7173 0.720001 28.0635 0.720001C25.2364 0.720001 22.6778 1.86624 20.8253 3.72025L4.49713 20.0585C1.71832 22.8391 -0.000427246 26.6811 -0.000427246 30.924C-0.000427246 39.4099 6.87457 46.2896 15.3555 46.2896C15.9053 46.2896 16.4483 46.26 16.983 46.2017ZM35.3023 24.5717C34.752 24.5717 34.2081 24.6055 33.6734 24.6631C33.3301 24.6984 33.0601 24.9856 33.0601 25.3393C33.0601 25.5279 33.1373 25.6985 33.2608 25.8223L34.0958 26.6582C36.0943 28.6584 36.0943 31.9013 34.0958 33.9014L13.5865 54.4243C11.7344 56.2784 10.5884 58.8394 10.5884 61.6675C10.5884 67.3252 15.1719 71.9117 20.8248 71.9117C23.6519 71.9117 26.211 70.7647 28.063 68.9114L46.1568 50.8063C48.9371 48.0249 50.6573 44.1823 50.6573 39.9372C50.6573 31.4513 43.7833 24.5717 35.3023 24.5717ZM73.6524 44.6149L68.6016 49.7327C71.3209 54.2709 76.3062 56.7967 82.7193 56.7967C90.3604 56.7967 95.6041 52.5198 95.6041 46.2997C95.6041 40.4677 92.3023 37.3566 84.3375 35.2808C79.8682 34.0496 78.1192 33.4672 78.1192 31.912C78.1192 30.4878 79.7388 29.5143 82.2657 29.5143C84.5958 29.5143 86.9297 30.7462 88.4815 32.9502L93.5328 27.8302C90.877 24.46 86.7979 22.3857 82.2003 22.3857C74.9464 22.3857 70.1563 26.1448 70.1563 31.9774C70.1563 37.8758 74.3643 40.9846 81.6807 42.9301C86.2813 44.3543 87.3829 45.0685 87.3829 46.5583C87.3829 48.1796 85.438 49.4108 82.7193 49.4108C78.5718 49.4108 75.2706 47.4654 73.6524 44.6149ZM127.27 39.5605C127.27 34.3103 123.644 30.2265 118.333 30.2265C113.152 30.2265 109.332 34.3103 109.332 39.5605C109.332 44.8734 113.152 48.8917 118.333 48.8917C123.644 48.8917 127.27 44.8734 127.27 39.5605ZM135.559 39.5605C135.559 49.2157 128.888 56.7959 119.692 56.7959C115.548 56.7959 111.988 55.2436 109.332 52.5853V68.6565H100.911V23.295H109.332V26.6646C111.988 24.0064 115.548 22.3849 119.692 22.3849C128.888 22.3849 135.559 29.9025 135.559 39.5605ZM140.866 55.8259H149.413V10.4623H140.866V55.8259ZM164.179 55.8259H155.629V23.2949H164.179V55.8259ZM155.047 14.6095C155.047 11.952 157.25 9.75024 159.906 9.75024C162.559 9.75024 164.759 11.952 164.759 14.6095C164.759 17.267 162.559 19.4688 159.906 19.4688C157.25 19.4688 155.047 17.267 155.047 14.6095ZM186.518 22.3849C176.74 22.3849 169.744 29.7729 169.744 39.5605C169.744 49.4742 176.74 56.7959 186.518 56.7959C193.514 56.7959 197.464 53.6877 200.509 50.0574L195.327 44.8734C193.19 47.0773 191.311 48.9551 186.971 48.9551C181.596 48.9551 178.102 45.0023 178.102 39.5605C178.102 34.2448 181.596 30.2265 186.971 30.2265C191.246 30.2265 193.133 32.1148 195.231 34.2144L195.327 34.3103L200.509 29.127C197.529 25.4961 193.514 22.3849 186.518 22.3849ZM211.708 35.8006H228.157C227.575 31.7822 224.403 29.4487 220.387 29.4487C216.113 29.4487 212.938 31.9774 211.708 35.8006ZM235.865 42.0862H211.449C212.356 46.5581 215.594 49.6037 220.387 49.6037C225.114 49.6037 227.38 47.4019 229.517 44.8733L234.568 49.7988C231.591 53.622 227.443 56.7965 220.126 56.7965C210.477 56.7965 203.548 49.4107 203.548 39.4942C203.548 29.7101 210.543 22.3855 220.126 22.3855C229.841 22.3855 235.865 29.9023 235.865 38.3926V42.0862Z" fillRule="evenodd" fill="currentColor"/>
          </svg>
          <div className="h-8 w-px bg-gray-600"></div>
          <div className="text-xs text-gray-400">
            <div className="font-semibold text-white">Splice</div>
            <div>Samples & Sounds</div>
          </div>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <span className="font-medium text-gray-300">Made without AI by</span>
          <a href="https://github.com/mcinderelle" target="_blank" rel="noopener noreferrer" 
             className="font-semibold hover:text-white transition-colors underline">
            Mayukhjit Chakraborty
          </a>
        </div>
      </div>

      <Modal size="3xl" isDismissable={false} hideCloseButton={!cfg().configured}
            isOpen={settings.isOpen} onOpenChange={settings.onOpenChange}
      >
        <SettingsModalContent/>
      </Modal>

      <HelpModal isOpen={help.isOpen} onClose={help.onClose}/>

      <div className="flex gap-3 items-start animate-slideIn" style={{ animationDelay: '0.1s' }}>
        <Input
            type="text"
            aria-label="Search for samples"
            placeholder="Search for samples... (Press / to focus)"
            labelPlacement="outside"
            variant="bordered"
            value={query}
            onKeyDown={handleSearchKeyDown}
            onChange={handleSearchInput}
            startContent={
              <SearchIcon className="w-5" />
            }
            endContent={
              searchLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <CircularProgress aria-label="Searching" className="w-4 h-4" />
                </div>
              ) : (
                <div className="text-[10px] text-gray-500 pr-1 whitespace-nowrap flex items-center gap-1"><span>Press</span><kbd className="px-1 py-0.5 bg-gray-800 rounded border border-gray-700">Enter</kbd></div>
              )
            }
            className="w-full max-w-2xl"
          />

        <Popover placement="bottom" showArrow>
          <PopoverTrigger>
            <Button variant="bordered" className="w-48 justify-between" endContent={<ChevronDownIcon/>}>
              { sortBy === 'relevance' ? 'Most relevant' : sortBy === 'popularity' ? 'Most popular' : sortBy === 'recency' ? 'Most recent' : 'Random' }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-2 w-56">
            <div className="flex flex-col">
              <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('relevance')}>Most relevant</button>
              <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('popularity')}>Most popular</button>
              <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('recency')}>Most recent</button>
              <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('random')}>Random</button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex gap-2 items-center">
          <Button size="sm" variant="bordered" className="hover-lift" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Toggle filters">
            {sidebarOpen ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Button size="sm" variant={useInfinite ? 'bordered' : 'faded'} className="hover-lift" onClick={()=>setUseInfinite(v=>!v)} aria-label="Toggle pagination mode" title="Toggle pagination vs infinite scroll">
            {useInfinite ? 'Infinite scroll' : 'Pagination'}
          </Button>
          {/* visible shortcut badges */}
          <div className="hidden md:flex items-center gap-1 text-[10px] text-gray-500 mr-2">
            <span className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700">/</span>
            <span>focus</span>
            <span className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 ml-2">Esc</span>
            <span>clear</span>
            <span className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 ml-2">Space</span>
            <span>play/pause</span>
            <span className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 ml-2">Ctrl+,</span>
            <span>settings</span>
          </div>
          <Button isIconOnly variant="bordered" aria-label="Help" 
                  onClick={help.onOpen}
                  className="hover-lift">
            <QuestionMarkCircleIcon className="w-5" />
          </Button>
          
          <Button isIconOnly variant="bordered" aria-label="Diagnostics" 
                  onClick={() => diagnostics.open()}
                  className="hover-lift"
                  title="Diagnostics">
            <InformationCircleIcon className="w-5 h-5" />
          </Button>

          <Button isIconOnly variant="bordered" aria-label="Settings" 
                  onClick={settings.onOpen}
                  className="hover-lift">
            <WrenchIcon className="w-5" />
          </Button>
          { netStatus && <span className="text-xs text-gray-400 pl-2">{netStatus}</span> }
        </div>
      </div>

      {/* Layout: sidebar + content */}
      <div className="flex gap-4 min-h-0 flex-1">
        {/* left sidebar filters */}
        {sidebarOpen && (
        <aside className="w-72 xl:w-80 shrink-0 sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto card p-4 rounded-lg pb-6">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">Filters</div>
          <div className="space-y-4 text-sm">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} />
                Compact rows
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hoverAudition} onChange={(e) => setHoverAudition(e.target.checked)} />
                Play on hover
              </label>
              {hoverAudition && (
                <label className="flex items-center gap-2">
                  Delay
                  <input type="range" min={0} max={600} value={hoverDelayMs} onChange={(e)=>setHoverDelayMs(parseInt((e.target as HTMLInputElement).value))}/>
                  <span className="tabular-nums">{hoverDelayMs}ms</span>
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={autoPlayOnNavigate} onChange={(e) => setAutoPlayOnNavigate(e.target.checked)} />
                Auto-play on Arrow keys
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
                Favorites only
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400">Waveform width</span>
              <div className="flex items-center gap-2">
                <input className="grow" type="range" min={280} max={800} value={waveformWidth} onChange={(e) => setWaveformWidth(parseInt((e.target as HTMLInputElement).value))} />
                <span className="tabular-nums">{waveformWidth}px</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400">Duration</span>
              <label className="flex items-center gap-2">
                Min
                <input className="grow" type="range" min={0} max={60} value={minDuration} onChange={(e)=>setMinDuration(parseInt((e.target as HTMLInputElement).value))} />
                <span className="tabular-nums">{minDuration}s</span>
              </label>
              <label className="flex items-center gap-2">
                Max
                <input className="grow" type="range" min={1} max={120} value={maxDuration} onChange={(e)=>setMaxDuration(parseInt((e.target as HTMLInputElement).value))} />
                <span className="tabular-nums">{maxDuration}s</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400">BPM</span>
              <label className="flex items-center gap-2">
                Min
                <input className="grow" type="range" min={0} max={240} value={minBpm} onChange={(e)=>setMinBpm(parseInt((e.target as HTMLInputElement).value))} />
                <span className="tabular-nums">{minBpm}</span>
              </label>
              <label className="flex items-center gap-2">
                Max
                <input className="grow" type="range" min={0} max={300} value={maxBpm} onChange={(e)=>setMaxBpm(parseInt((e.target as HTMLInputElement).value))} />
                <span className="tabular-nums">{maxBpm}</span>
              </label>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sortKeyProximity} onChange={(e)=>setSortKeyProximity(e.target.checked)} />
              Sort by key proximity
            </label>

            <div className="flex gap-2 pt-2">
              <button
                className="px-2 py-1 rounded border border-gray-600 hover:bg-white/5"
                onClick={() => pbCtx.cancellation?.()}
              >Stop all</button>
              <button
                className="px-2 py-1 rounded border border-gray-600 hover:bg-white/5"
                onClick={() => {
                  setMinDuration(0); setMaxDuration(30); setMinBpm(0); setMaxBpm(999); setFavoritesOnly(false); setSortKeyProximity(false);
                }}
              >Reset</button>
            </div>

            {/* Tag/Key/BPM selectors moved here */}
            <div className="pt-4 space-y-3">
              {/* Instruments popover */}
              <Popover placement="bottom" showArrow>
                <PopoverTrigger>
                  <Button variant="bordered" className="w-full justify-between" endContent={<ChevronDownIcon/>} onClick={()=>ensureContraintsGathered()}>Instruments</Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-72 max-h-72 overflow-auto z-50">
                  <div className="flex flex-col gap-2">
                    { knownInstruments.length === 0 ? (
                      <div className="text-xs text-gray-400">No instruments yet. Type a query or click again to refresh.</div>
                    ) : knownInstruments.map((x: any) => (
                      <label key={x.uuid} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={instruments.has(x.uuid)} onChange={(e)=>{
                          const next = new Set(instruments);
                          if (e.target.checked) next.add(x.uuid); else next.delete(x.uuid);
                          setInstruments(next);
                        }} />
                    {instrumentSvg(x.name)}
                    <span>{toTitle(x.name)}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Genres popover */}
              <Popover placement="bottom" showArrow>
                <PopoverTrigger>
                  <Button variant="bordered" className="w-full justify-between" endContent={<ChevronDownIcon/>} onClick={()=>ensureContraintsGathered()}>Genres</Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-72 max-h-72 overflow-auto z-50">
                  <div className="grid grid-cols-1 gap-2">
                    { knownGenres.length === 0 ? (
                      <div className="text-xs text-gray-400">No genres yet. Type a query or click again to refresh.</div>
                    ) : knownGenres.map((x: any) => (
                      <label key={x.uuid} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={genres.has(x.uuid)} onChange={(e)=>{
                          const next = new Set(genres);
                          if (e.target.checked) next.add(x.uuid); else next.delete(x.uuid);
                          setGenres(next);
                        }} />
                        <span>{toTitle(x.name)}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Tags popover */}
              <Popover placement="bottom" showArrow>
                <PopoverTrigger>
                  <Button variant="bordered" className="w-full justify-between" endContent={<ChevronDownIcon/>} onClick={()=>ensureContraintsGathered()}>Tags</Button>
                </PopoverTrigger>
                <PopoverContent className="p-3 w-72 max-h-72 overflow-auto z-50">
                  <div className="grid grid-cols-1 gap-2">
                    { (knownTags.length ? knownTags : Array.from(tags)).length === 0 ? (
                      <div className="text-xs text-gray-400">No tags yet. Type a query or click again to refresh.</div>
                    ) : (knownTags.length ? knownTags : Array.from(tags)).map((x: any) => (
                      <label key={x.uuid} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={tags.some((t: any) => t.uuid === x.uuid)} onChange={(e)=>{
                          if (e.target.checked) {
                            if (!tags.some((t: any) => t.uuid === x.uuid)) { setTags([...(tags as any), x]); }
                          } else {
                            setTags((tags as any).filter((t: any) => t.uuid !== x.uuid));
                          }
                        }} />
                        <span>{toTitle(x.label || x.name)}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex gap-2">
                <Popover placement="bottom" showArrow={true} isOpen={keyPopOpen} onOpenChange={(o)=>setKeyPopOpen(!!o)}>
                  <PopoverTrigger>
                    <Button variant="bordered" className="min-w-36" endContent={<ChevronDownIcon/>} onClick={()=>setKeyPopOpen(v=>!v)}>
                      { 
                        (musicKey == null && chordType == null) ? "Key"
                          : `${musicKey ?? ""}${chordType == null ? "" : chordType == "major" ? " Major" : " Minor"}`
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="flex p-8 animate-scaleIn z-20">
                    <KeyScaleSelection
                      onChordSet={(c)=>{ setChordType(c); setKeyPopOpen(false); }} onKeySet={(k)=>{ setMusicKey(k); setKeyPopOpen(false); }}
                      selectedChord={chordType} selectedKey={musicKey}
                    />
                  </PopoverContent>
                </Popover>

                <Popover placement="bottom" showArrow>
                  <PopoverTrigger>
                    <Button variant="bordered" className="min-w-32 justify-between" endContent={<ChevronDownIcon/>}>
                      { sampleType === 'any' ? 'Any' : sampleType === 'oneshot' ? 'One-Shots' : 'Loops' }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-2 w-40">
                    <div className="flex flex-col">
                      <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSampleType('any' as any)}>Any</button>
                      <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSampleType('oneshot')}>One-Shots</button>
                      <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSampleType('loop')}>Loops</button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* main content */}
        <section className="flex-1 min-w-0 min-h-0 flex">

      {
        query.length > 0 && results
        ? results.length == 0
        ? <div className="card flex flex-col items-center h-full justify-center space-y-6 rounded-lg animate-fadeIn p-8">
            <img className="w-20 animate-scaleIn" src="img/blob-think.png"/>
            <p className="font-medium text-lg">No samples found</p>
            <p className="text-gray-400 text-sm">Try changing your query and filters</p>
          </div>
        : <div ref={resultContainer}
            className="card my-4 mb-16 overflow-y-auto overflow-x-hidden rounded-lg flex flex-col min-h-0 gap-0 animate-fadeIn flex-1 max-w-full"
        >
              <div className="sticky top-0 z-10 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/40 border-b border-white/10 px-4 md:px-6 py-3 flex flex-wrap gap-3 justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-xl font-semibold truncate">Samples</h4>
                    <p className="text-sm text-gray-400 truncate">Found {resultCount.toLocaleString()} {resultCount !== 1 ? "samples" : "sample"}</p>
                  </div>
                  {/* active filters count */}
                  <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/15 text-gray-200 whitespace-nowrap">
                    {(() => {
                      let c = 0;
                      if (favoritesOnly) c++;
                      if (Array.from(tags).length) c++;
                      if (instruments.size) c++;
                      if (genres.size) c++;
                      if (musicKey) c++;
                      if (chordType) c++;
                      if (sampleType !== 'any') c++;
                      if (minDuration > 0 || maxDuration < 120) c++;
                      if (minBpm > 0 || maxBpm < 300) c++;
                      if (bpm?.bpm || bpm?.minBpm || bpm?.maxBpm) c++;
                      return `${c} active`;
                    })()}
                  </span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  {/* sort quick access */}
                  <Popover placement="bottom" showArrow>
                    <PopoverTrigger>
                      <Button variant="bordered" className="w-40 justify-between" endContent={<ChevronDownIcon/>}>
                        { sortBy === 'relevance' ? 'Most relevant' : sortBy === 'popularity' ? 'Most popular' : sortBy === 'recency' ? 'Most recent' : 'Random' }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-2 w-52">
                      <div className="flex flex-col">
                        <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('relevance')}>Most relevant</button>
                        <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('popularity')}>Most popular</button>
                        <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('recency')}>Most recent</button>
                        <button className="text-left px-3 py-2 hover:bg-white/5 rounded" onClick={()=>setSortBy('random')}>Random</button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  { searchLoading && <CircularProgress aria-label="Loading results..." className="w-6 h-6"/> }
                </div>
              </div>

              <div className="flex-1">
                { useInfinite ? (
                  <InfiniteResults
                    items={(favoritesOnly ? results.filter((r: any) => localStorage.getItem(`fav:${r.uuid}`) === '1') : results)
                      .filter((r: any) => {
                        const durSec = (r.duration ?? 0) / 1000;
                        const bpmOk = (r.bpm == null) || (r.bpm >= minBpm && r.bpm <= maxBpm);
                        return durSec >= minDuration && durSec <= maxDuration && bpmOk;
                      })
                      .sort((a: any, b: any) => {
                        if (!sortKeyProximity || !musicKey) return 0;
                        const ka = (a.key || '').toUpperCase();
                        const kb = (b.key || '').toUpperCase();
                        const dist = (k: string) => (k && musicKey) ? Math.min(Math.abs(k.charCodeAt(0) - (musicKey as string).charCodeAt(0)), 12 - Math.abs(k.charCodeAt(0) - (musicKey as string).charCodeAt(0))) : 99;
                        return dist(ka) - dist(kb);
                      })}
                    renderItem={(sample, index) => (
                      <div key={sample.uuid} className="pr-2" data-sample-idx={index}>
                        <SampleListEntry sample={sample} onTagClick={handleTagClick} ctx={pbCtx} waveformWidth={waveformWidth} compact={compactMode} hoverAudition={hoverAudition} hoverDelayMs={hoverDelayMs} isSelected={selectedIndex === index} />
                      </div>
                    )}
                    loadMore={async () => { changePage(currentPage + 1); }}
                    hasMore={currentPage < totalPages}
                    root={resultContainer.current}
                  />
                ) : (
                <VirtualList
                  items={(favoritesOnly ? results.filter((r: any) => localStorage.getItem(`fav:${r.uuid}`) === '1') : results)
                    .filter((r: any) => {
                      const durSec = (r.duration ?? 0) / 1000;
                      const bpmOk = (r.bpm == null) || (r.bpm >= minBpm && r.bpm <= maxBpm);
                      return durSec >= minDuration && durSec <= maxDuration && bpmOk;
                    })
                    .sort((a: any, b: any) => {
                      if (!sortKeyProximity || !musicKey) return 0;
                      const ka = (a.key || '').toUpperCase();
                      const kb = (b.key || '').toUpperCase();
                      const dist = (k: string) => (k && musicKey) ? Math.min(Math.abs(k.charCodeAt(0) - (musicKey as string).charCodeAt(0)), 12 - Math.abs(k.charCodeAt(0) - (musicKey as string).charCodeAt(0))) : 99;
                      return dist(ka) - dist(kb);
                    })}
                  height={600}
                  itemHeight={compactMode ? 120 : 160}
                  render={(sample, index) => (
                    <div key={sample.uuid} className="pr-2" data-sample-idx={index}>
                      <SampleListEntry sample={sample} onTagClick={handleTagClick} ctx={pbCtx} waveformWidth={waveformWidth} compact={compactMode} hoverAudition={hoverAudition} hoverDelayMs={hoverDelayMs} isSelected={selectedIndex === index} />
                    </div>
                  )}
                />)}
              </div>

              { !useInfinite && (
              <div className="w-full flex justify-center px-6 pb-4">
                <div className="flex items-center gap-3 overflow-visible">
                <Pagination variant="bordered" total={totalPages}
                  page={currentPage} onChange={changePage}
                />
                  <span className="text-xs text-gray-400 whitespace-nowrap">of {totalPages.toLocaleString()} pages</span>
              </div>
              </div>
              )}
            </div>
          : <div className="card flex flex-col items-center h-full justify-center space-y-6 rounded-lg animate-fadeIn p-12">
              <img className="w-32 animate-scaleIn" src="img/blob-salute.png"/>
              <p className="font-semibold text-2xl">Ready to explore!</p>
              <p className="text-gray-400 text-center max-w-md">
                Search for samples, filter by BPM, key, instruments, and more
              </p>
              <div className="flex flex-col gap-3 mt-6">
                <p className="font-medium text-gray-400 text-sm mb-2">Keyboard shortcuts:</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">/</kbd>
                    <span className="text-gray-400">Focus search</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">Esc</kbd>
                    <span className="text-gray-400">Clear search</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">Space</kbd>
                    <span className="text-gray-400">Play/Pause</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">Ctrl+,</kbd>
                    <span className="text-gray-400">Open settings</span>
                  </div>
                </div>
              </div>
            </div>
      }
        </section>
      </div>
    </main>
    </ToastProvider>
  );
}

export default App;
