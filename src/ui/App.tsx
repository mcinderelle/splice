import { useEffect, useRef, useState } from "react";
import { Button, CircularProgress, Input, Modal, Pagination, Popover, PopoverContent, PopoverTrigger, Radio, RadioGroup, Select, SelectItem, useDisclosure } from "@nextui-org/react";
import { SearchIcon, ChevronDownIcon } from '@nextui-org/shared-icons'
import { WrenchIcon, QuestionMarkCircleIcon } from "@heroicons/react/20/solid";
import { cfg } from "../config";
import { GRAPHQL_URL, SpliceSample, createSearchRequest } from "../splice/api";
import { ChordType, MusicKey, SpliceSampleType, SpliceSortBy, SpliceTag } from "../splice/entities";
import { httpFetch } from "../utils/httpFetch";
import SampleListEntry from "./components/SampleListEntry";
import SettingsModalContent from "./components/SettingsModalContent";
import KeyScaleSelection from "./components/KeyScaleSelection";
import HelpModal from "./components/HelpModal";
import { SamplePlaybackCancellation, SamplePlaybackContext } from "./playback";

function App() {
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

  const [queryTimer, setQueryTimer] = useState<NodeJS.Timeout | null>(null);

  const [sortBy, setSortBy] = useState<SpliceSortBy>("relevance");
  const [sampleType, setSampleType] = useState<SpliceSampleType | "any">("any")

  const [knownInstruments, setKnownInstruments] = useState<{name: string, uuid: string}[]>([]);
  const [knownGenres, setKnownGenres] = useState<{name: string, uuid: string}[]>([]);

  const [instruments, setInstruments] = useState(new Set<string>([]));
  const [genres, setGenres] = useState(new Set<string>([]));
  let [tags, setTags] = useState<SpliceTag[]>([]);

  const [musicKey, setMusicKey] = useState<MusicKey | null>(null);
  const [chordType, setChordType] = useState<ChordType | null>(null);

  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    updateSearch(query);
  }, [
    sortBy, bpm, bpmType, sampleType,
    instruments, genres, currentPage,
    musicKey, chordType
  ]); 

  const [smplCancellation, smplSetCancellation] = useState<SamplePlaybackCancellation | null>(null);
  const pbCtx: SamplePlaybackContext = {
    cancellation: smplCancellation,
    setCancellation: smplSetCancellation
  }

  // Keyboard shortcuts for musicians
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in an input
      const activeElement = document.activeElement;
      const isTyping = activeElement?.tagName === 'INPUT' || 
                       activeElement?.tagName === 'TEXTAREA';
      
      // Space to play/stop current sample
      if (e.code === 'Space' && !isTyping) {
        e.preventDefault();
        pbCtx.cancellation?.();
      }
      
      // Esc to clear search
      if (e.key === 'Escape' && !isTyping) {
        setQuery("");
      }
      
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[aria-label="Search for samples"]') as HTMLInputElement;
        searchInput?.focus();
        searchInput?.select();
      }
      
      // Ctrl/Cmd + / to open settings
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
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
  }, [pbCtx, settings, help, setQuery]);

  function ensureContraintsGathered() {
    if (knownInstruments.length == 0 || knownGenres.length == 0) {
      updateSearch("");
    }
  }

  function changePage(n: number) {
    setCurrentPage(n);
    resultContainer.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  function handleSearchInput(ev: React.ChangeEvent<HTMLInputElement>) {
    setQuery(ev.target.value);
    
    if (queryTimer != null) {
      clearTimeout(queryTimer);
    }

    // We set a timer, as to not overload Splice with needless requests while the user is typing.
    let selfTimer = setTimeout(() => updateSearch(ev.target.value, true), 100);
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

  async function updateSearch(newQuery: string, resetPage = false) {
      try {
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

        const resp = await httpFetch(GRAPHQL_URL, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: payload
        });

        pbCtx.cancellation?.(); // stop any sample that's currently playing

        const data = resp.data.data.assetsSearch;

        setResults(data.items);
        setResultCount(data.response_metadata.records);

        setCurrentPage(resetPage ? 1 : data.pagination_metadata.currentPage);
        setTotalPages(data.pagination_metadata.totalPages);

        function findConstraints(name: "Genre" | "Instrument") {
          return data.tag_summary.map((x: any) => x.tag)
            .filter((x: any) => x.taxonomy.name == name)
            .map((x: any) => ({ name: x.label, uuid: x.uuid }));
        }

        setKnownGenres(findConstraints("Genre"));
        setKnownInstruments(findConstraints("Instrument"));
      } catch (error) {
        console.error("Error updating search:", error);
        setResults([]);
        setResultCount(0);
      } finally {
        setSearchLoading(false);
      }
  }

  return (
    <main className="flex flex-col gap-4 m-6 h-screen animate-fadeIn">
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
            @mcinderelle
          </a>
        </div>
      </div>

      <Modal size="3xl" isDismissable={false} hideCloseButton={!cfg().configured}
            isOpen={settings.isOpen} onOpenChange={settings.onOpenChange}
      >
        <SettingsModalContent/>
      </Modal>

      <HelpModal isOpen={help.isOpen} onClose={help.onClose}/>

      <div className="flex gap-3 animate-slideIn" style={{ animationDelay: '0.1s' }}>
        <Input
            type="text"
            aria-label="Search for samples"
            placeholder="Search for samples... (Ctrl+K to focus)"
            labelPlacement="outside"
            variant="bordered"
            value={query}
            onKeyDown={handleSearchKeyDown}
            onChange={handleSearchInput}
            startContent={
              <SearchIcon className="w-5" />
            }
            className="flex-1"
          />

        <Select variant="bordered"
          aria-label="Sort by"
          selectedKeys={[sortBy]} onChange={(e: any) => setSortBy(e.target.value as SpliceSortBy)}
          startContent={<span className="w-20 text-sm text-foreground-400">Sort: </span>}
          className="min-w-40"
        >
            <SelectItem key="relevance">Most relevant</SelectItem>
            <SelectItem key="popularity">Most popular</SelectItem>
            <SelectItem key="recency">Most recent</SelectItem>
            <SelectItem key="random">Random</SelectItem>
        </Select>

        <div className="flex gap-2">
          <Button isIconOnly variant="bordered" aria-label="Help" 
                  onClick={help.onOpen}
                  className="hover-lift">
            <QuestionMarkCircleIcon className="w-5" />
          </Button>
          
          <Button isIconOnly variant="bordered" aria-label="Settings" 
                  onClick={settings.onOpen}
                  className="hover-lift">
            <WrenchIcon className="w-5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select placeholder="Instruments" aria-label="Instruments" variant="bordered"
          selectionMode="multiple" onOpenChange={ensureContraintsGathered}
          selectedKeys={instruments}
          onSelectionChange={(x: any) => setInstruments(x as Set<string>)}
          className="min-w-48 flex-1"
        >
          { knownInstruments.map((x: any) => <SelectItem key={x.uuid}>{x.name}</SelectItem>) }
        </Select>

        <Select placeholder="Genres" aria-label="Genres" variant="bordered"
          selectionMode="multiple" onOpenChange={ensureContraintsGathered}
          selectedKeys={genres}
          onSelectionChange={(x: any) => setGenres(x as Set<string>)}
          className="min-w-48 flex-1"
        >
          { knownGenres.map((x: any) => <SelectItem key={x.uuid}>{x.name}</SelectItem>) }
        </Select>

        <Select placeholder="Tags" aria-label="Tags" variant="bordered"
          selectionMode="multiple"
          selectedKeys={Array.from(tags).map((x: any) => x.uuid)}
          onSelectionChange={(x: any) => updateTagState(x as Set<string>)}
          className="min-w-48 flex-1"
        >
          { Array.from(tags).map((x: any) => <SelectItem key={x.uuid}>{x.label}</SelectItem>) }
        </Select>

        <Popover placement="bottom" showArrow={true}>
          <PopoverTrigger>
            <Button variant="bordered" className="min-w-32" endContent={<ChevronDownIcon/>}>
              { 
                (musicKey == null && chordType == null) ? "Key"
                  : `${musicKey ?? ""}${chordType == null ? "" : chordType == "major" ? " Major" : " Minor"}`
              }
            </Button>
          </PopoverTrigger>

          <PopoverContent className="flex p-8 animate-scaleIn">
            <KeyScaleSelection
              onChordSet={setChordType} onKeySet={setMusicKey}
              selectedChord={chordType} selectedKey={musicKey}
            />
          </PopoverContent>
        </Popover>

        <Popover placement="bottom" showArrow={true}>
          <PopoverTrigger>
            <Button variant="bordered" className="min-w-32" endContent={<ChevronDownIcon/>}>
              { (bpmType == "exact" && bpm?.bpm
                  ? `${bpm?.bpm} BPM`
                  : bpmType == "range" && bpm?.maxBpm && bpm.minBpm
                    ? `${bpm.minBpm} - ${bpm.maxBpm} BPM`
                    : "BPM"
                )
              } 
            </Button>
          </PopoverTrigger>

          <PopoverContent className="p-8 flex items-start justify-start animate-scaleIn">
            <div className="space-y-4">
              <RadioGroup defaultValue="exact" value={bpmType}>
                <Radio value="exact" onChange={() => setBpmType("exact")}>Exact</Radio>
                <Radio value="range" onChange={() => setBpmType("range")}>Range</Radio>
              </RadioGroup>

              {
                bpmType == "exact" ? (
                  <div className="mt-4">
                    <Input
                      type="number" variant="bordered"
                      label="BPM" labelPlacement="outside"
                      placeholder="Enter tempo"
                      onChange={(e: any) => setBpm({ ...bpm, bpm: e.target.value })}
                      value={bpm?.bpm?.toString() ?? ""}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 mt-4">
                    <Input
                      type="number" variant="bordered"
                      label="Minimum" labelPlacement="outside" endContent="BPM"
                      placeholder="Min tempo"
                      onChange={(e: any) => setBpm({...bpm, minBpm: parseInt(e.target.value) })}
                      value={bpm?.minBpm?.toString() ?? ""}
                    />

                    <Input
                      type="number" variant="bordered"
                      label="Maximum" labelPlacement="outside" endContent="BPM"
                      placeholder="Max tempo"
                      onChange={(e: any) => setBpm({...bpm, maxBpm: parseInt(e.target.value) })}
                      value={bpm?.maxBpm?.toString() ?? ""}
                    />
                  </div>
                )
              }
            </div>
          </PopoverContent>
        </Popover>

        <Select aria-label="Type"
          selectedKeys={[sampleType]} onChange={(e: any) => setSampleType(e.target.value as SpliceSampleType)}
          variant="bordered" className="min-w-40"
        >
          <SelectItem key="any">Any</SelectItem>
          <SelectItem key="oneshot">One-Shots</SelectItem>
          <SelectItem key="loop">Loops</SelectItem>
        </Select>
      </div>

      {
        query.length > 0 && results
        ? results.length == 0
        ? <div className="card flex flex-col items-center h-full justify-center space-y-6 rounded-lg animate-fadeIn p-8">
            <img className="w-20 animate-scaleIn" src="img/blob-think.png"/>
            <p className="font-medium text-lg">No samples found</p>
            <p className="text-gray-400 text-sm">Try changing your query and filters</p>
          </div>
        : <div ref={resultContainer}
            className="card my-4 mb-16 overflow-y-scroll p-10 rounded-lg flex flex-col gap-6 animate-fadeIn"
        >
              <div className="flex justify-between items-center mb-2">
                <div className="space-y-2">
                  <h4 className="text-xl font-semibold">Samples</h4>
                  <p className="text-sm text-gray-400">Found {resultCount.toLocaleString()} {resultCount !== 1 ? "samples" : "sample"}</p>
                </div>

                <div className="flex items-center gap-3"> 
                  { searchLoading && <CircularProgress aria-label="Loading results..." className="w-6 h-6"/> } 
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-4">
              { results.map((sample, index) => (
                <div key={sample.uuid} style={{ animationDelay: `${index * 0.05}s` }} className="animate-slideIn">
                  <SampleListEntry sample={sample} onTagClick={handleTagClick} ctx={pbCtx}/>
                </div>
              ))}
              </div>

              <div className="w-full flex justify-center">
                <Pagination variant="bordered" total={totalPages}
                  page={currentPage} onChange={changePage}
                />
              </div>
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
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">Ctrl+K</kbd>
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
                    <kbd className="px-2 py-1 bg-gray-800 rounded font-mono">Ctrl+/</kbd>
                    <span className="text-gray-400">Open settings</span>
                  </div>
                </div>
              </div>
            </div>
      }
    </main>
  );
}

export default App;
