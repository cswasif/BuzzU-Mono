'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { KlipyApi } from '../klipy-api';
import { SearchInput } from './SearchInput';
import { GifGrid } from './GifGrid';
import { CategoryGrid } from './CategoryGrid';
import { TrendingTerms } from './TrendingTerms';
import type { GifPickerProps, GifImage, GifCategory, Theme, GifPickerLabels } from '../types';

// Default labels
const DEFAULT_LABELS: Required<GifPickerLabels> = {
  searchPlaceholder: 'Search GIFs',
  trendingTitle: 'Trending',
  categoriesTitle: 'Categories',
  loadingText: 'Loading GIFs...',
  noResultsText: 'No GIFs found',
  poweredByText: 'Powered by',
};

// Helper function to deduplicate GIFs by ID
function deduplicateGifs(gifList: GifImage[]): GifImage[] {
  const seen = new Set<string>();
  return gifList.filter((gif) => {
    const id = gif.id || Math.random().toString();
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function useSystemTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return theme;
}

export function GifPicker({
  klipyApiKey,
  onGifClick,
  theme = 'light',
  autoFocusSearch = true,
  contentFilter = 'off',
  clientKey = 'gif-picker-react-klipy',
  country = 'US',
  locale = 'en_US',
  width = 350,
  height = 450,
  categoryHeight = 100,
  initialSearchTerm = '',
  columns = 2,
  className = '',
  labels: customLabels,
}: GifPickerProps) {
  // Merge custom labels with defaults
  const labels: Required<GifPickerLabels> = { ...DEFAULT_LABELS, ...customLabels };
  // State
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [gifs, setGifs] = useState<GifImage[]>([]);
  const [categories, setCategories] = useState<GifCategory[]>([]);
  const [trendingTerms, setTrendingTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Refs for stable callbacks
  const apiRef = useRef<KlipyApi | null>(null);
  const nextPosRef = useRef<string | undefined>(undefined);
  const currentQueryRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const systemTheme = useSystemTheme();
  const resolvedTheme: 'light' | 'dark' = theme === 'auto' ? systemTheme : theme;

  // Initialize API once
  useEffect(() => {
    apiRef.current = new KlipyApi({
      apiKey: klipyApiKey,
      clientKey,
      country,
      locale,
      contentFilter,
    });
  }, [klipyApiKey, clientKey, country, locale, contentFilter]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Load categories and trending terms on mount
  useEffect(() => {
    async function loadInitialData() {
      if (!apiRef.current) return;
      
      setApiError(null);
      try {
        const [categoriesData, termsData] = await Promise.all([
          apiRef.current.getCategories(),
          apiRef.current.getTrendingTerms(),
        ]);
        if (mountedRef.current) {
          setCategories(categoriesData);
          setTrendingTerms(termsData);
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
        if (mountedRef.current) {
          if (error instanceof Error && error.message.includes('403')) {
            setApiError('Invalid API key. Please get a valid key from partner.klipy.com');
          } else {
            setApiError('Failed to connect to Klipy API');
          }
        }
      } finally {
        if (mountedRef.current) {
          setLoadingCategories(false);
        }
      }
    }

    // Small delay to ensure apiRef is set
    const timer = setTimeout(loadInitialData, 10);
    return () => clearTimeout(timer);
  }, [klipyApiKey]); // Only re-run if API key changes

  // Search function - stable, no dependencies that change
  const performSearch = useCallback(async (query: string) => {
    if (!apiRef.current || !mountedRef.current) return;

    // Cancel any pending search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (!query.trim()) {
      setGifs([]);
      setLoading(false);
      nextPosRef.current = undefined;
      currentQueryRef.current = undefined;
      return;
    }

    setLoading(true);
    setApiError(null);
    nextPosRef.current = undefined;
    currentQueryRef.current = query;

    try {
      const result = await apiRef.current.search(query);
      
      if (!mountedRef.current) return;
      
      const uniqueGifs = deduplicateGifs(result.gifs);
      setGifs(uniqueGifs);
      nextPosRef.current = result.next;
    } catch (error) {
      if (!mountedRef.current) return;
      
      // Don't show error for aborted requests
      if (error instanceof Error && error.name === 'AbortError') return;
      
      console.error('Failed to load GIFs:', error);
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          setApiError('Request timed out. Please check your internet connection.');
        } else if (error.message.includes('403')) {
          setApiError('Invalid API key.');
        } else {
          setApiError(`Failed to load GIFs: ${error.message}`);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounce
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchTerm);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, performSearch]);

  // Load more function - stable reference
  const loadMore = useCallback(async () => {
    if (!apiRef.current || !mountedRef.current) return;
    if (!nextPosRef.current) return;
    
    // Don't load more if already loading (check via ref to avoid dependency)
    setLoading(prev => {
      if (prev) return prev; // Already loading, skip
      
      // Start loading more
      const fetchMore = async () => {
        try {
          const result = currentQueryRef.current
            ? await apiRef.current!.search(currentQueryRef.current, 20, nextPosRef.current)
            : await apiRef.current!.getTrending(20, nextPosRef.current);

          if (!mountedRef.current) return;

          setGifs(prevGifs => {
            const combined = [...prevGifs, ...result.gifs];
            return deduplicateGifs(combined);
          });
          nextPosRef.current = result.next;
        } catch (error) {
          console.error('Failed to load more GIFs:', error);
        } finally {
          if (mountedRef.current) {
            setLoading(false);
          }
        }
      };

      fetchMore();
      return true; // Set loading to true
    });
  }, []);

  // Event handlers
  const handleGifClick = useCallback((gif: GifImage) => {
    if (apiRef.current) {
      apiRef.current.registerShare(gif.id, currentQueryRef.current);
    }
    onGifClick?.(gif);
  }, [onGifClick]);

  const handleCategoryClick = useCallback((category: GifCategory) => {
    setSearchTerm(category.searchTerm);
  }, []);

  const handleTrendingTermClick = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  // Computed values
  const containerStyle: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  const showCategories = !searchTerm && gifs.length === 0;

  return (
    <div
      className={`gpr-picker gpr-theme-${resolvedTheme} ${className}`}
      style={containerStyle}
    >
      <div className="gpr-header">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          autoFocus={autoFocusSearch}
          placeholder={labels.searchPlaceholder}
        />
      </div>

      <div className="gpr-body">
        {apiError ? (
          <div className="gpr-api-error">
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
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="gpr-api-error-title">API Error</p>
            <p className="gpr-api-error-message">{apiError}</p>
            <a
              href="https://partner.klipy.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="gpr-api-error-link"
            >
              Get Free API Key →
            </a>
          </div>
        ) : showCategories ? (
          <>
            <TrendingTerms 
              terms={trendingTerms} 
              onTermClick={handleTrendingTermClick}
              title={labels.trendingTitle}
            />
            <div className="gpr-categories-section">
              <div className="gpr-section-title">{labels.categoriesTitle}</div>
              <CategoryGrid
                categories={categories}
                onCategoryClick={handleCategoryClick}
                categoryHeight={categoryHeight}
                loading={loadingCategories}
              />
            </div>
          </>
        ) : (
          <GifGrid
            gifs={gifs}
            onGifClick={handleGifClick}
            onLoadMore={loadMore}
            loading={loading}
            columns={columns}
            loadingText={labels.loadingText}
            noResultsText={labels.noResultsText}
          />
        )}
      </div>

      <div className="gpr-footer">
        <a
          href="https://klipy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="gpr-attribution"
        >
          <span>{labels.poweredByText}</span>
          <svg width="50" height="14" viewBox="0 0 50 14" fill="currentColor">
            <text x="0" y="11" fontSize="12" fontWeight="bold" fontFamily="system-ui, sans-serif">
              KLIPY
            </text>
          </svg>
        </a>
      </div>
    </div>
  );
}
