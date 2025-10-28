import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  render: (item: T, index: number) => React.ReactNode;
}

export default function VirtualList<T>({ items, itemHeight, height, render }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState<number>(height);

  const onScroll = useCallback(() => {
    if (!containerRef.current) return;
    setScrollTop(containerRef.current.scrollTop);
  }, []);

  // Auto-resize to container height
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.max(120, Math.floor(entry.contentRect.height));
        setMeasuredHeight(h);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const effectiveHeight = measuredHeight ?? height;
  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5);
  const visibleCount = Math.ceil(effectiveHeight / itemHeight) + 10;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const offsetY = startIndex * itemHeight;

  const visibleItems = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  return (
    <div ref={containerRef} onScroll={onScroll} style={{ height: effectiveHeight, overflowY: 'auto' }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
          {visibleItems.map((item, i) => (
            <div key={startIndex + i} style={{ height: itemHeight }}>
              {render(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


