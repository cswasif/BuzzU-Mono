'use client';

import React, { useRef, useEffect } from 'react';
import type { GifImage } from '../types';

interface GifGridProps {
  gifs: GifImage[];
  onGifClick?: (gif: GifImage) => void;
  onLoadMore?: () => void;
  loading?: boolean;
  columns?: number;
  loadingText?: string;
  noResultsText?: string;
}

export function GifGrid({ 
  gifs, 
  onGifClick, 
  onLoadMore, 
  loading = false, 
  columns = 2,
  loadingText = 'Loading GIFs...',
  noResultsText = 'No GIFs found',
}: GifGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const loadingRef = useRef(loading);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Keep refs up to date without causing re-renders
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Set up IntersectionObserver once on mount
  useEffect(() => {
    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && onLoadMoreRef.current && !loadingRef.current) {
        onLoadMoreRef.current();
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: '200px',
      threshold: 0.1,
    });

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []); // Empty deps - only run once on mount

  // Distribute gifs into columns using masonry-like layout
  const columnArrays: GifImage[][] = Array.from({ length: columns }, () => []);
  const columnHeights = Array(columns).fill(0);

  gifs.forEach((gif) => {
    const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
    columnArrays[shortestColumn].push(gif);
    const aspectRatio = gif.height / gif.width || 1;
    columnHeights[shortestColumn] += aspectRatio * 100;
  });

  return (
    <div className="gpr-gif-grid" style={{ '--gpr-columns': columns } as React.CSSProperties}>
      {columnArrays.map((column, colIndex) => (
        <div key={colIndex} className="gpr-gif-column">
          {column.map((gif, gifIndex) => (
            <button
              key={`${gif.id}-${colIndex}-${gifIndex}`}
              className="gpr-gif-item"
              onClick={() => onGifClick?.(gif)}
              type="button"
              title={gif.description || gif.title}
            >
              <img
                src={gif.previewUrl || gif.url}
                alt={gif.description || gif.title || 'GIF'}
                loading="lazy"
                className="gpr-gif-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src !== gif.url && gif.url) {
                    target.src = gif.url;
                  }
                }}
              />
            </button>
          ))}
        </div>
      ))}
      {gifs.length === 0 && !loading && (
        <div className="gpr-empty-state">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          <p>{noResultsText}</p>
        </div>
      )}
      {loading && (
        <div className="gpr-loading">
          <div className="gpr-spinner" />
          <p className="gpr-loading-text">{loadingText}</p>
        </div>
      )}
      <div ref={loadMoreRef} className="gpr-load-more-trigger" />
    </div>
  );
}
