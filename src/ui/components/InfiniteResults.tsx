import React, { useEffect, useRef, useState } from "react";

interface InfiniteResultsProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  loadMore: () => Promise<void> | void;
  hasMore: boolean;
  root?: HTMLElement | null;
}

export default function InfiniteResults<T>({ items, renderItem, loadMore, hasMore, root }: InfiniteResultsProps<T>) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(async (entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && !loading) {
        setLoading(true);
        try { await loadMore(); } finally { setLoading(false); }
      }
    }, { root: root ?? undefined, rootMargin: "400px 0px", threshold: 0 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, hasMore, loading, root]);

  return (
    <div className="flex flex-col gap-0">
      {items.map((item, idx) => renderItem(item, idx))}
      <div ref={sentinelRef} className="h-10" />
      {loading && <div className="py-4 text-center text-xs text-gray-400">Loading…</div>}
      {!hasMore && <div className="py-4 text-center text-xs text-gray-500">End of results</div>}
    </div>
  );
}


