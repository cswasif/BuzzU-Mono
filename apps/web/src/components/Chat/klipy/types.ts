// Klipy API Types

export interface KlipyMediaFormat {
  url: string;
  dims: [number, number]; // [width, height]
  duration: number;
  size: number;
}

export interface KlipyMediaFormats {
  gif: KlipyMediaFormat;
  mediumgif?: KlipyMediaFormat;
  tinygif: KlipyMediaFormat;
  nanogif?: KlipyMediaFormat;
  mp4?: KlipyMediaFormat;
  loopedmp4?: KlipyMediaFormat;
  tinymp4?: KlipyMediaFormat;
  nanomp4?: KlipyMediaFormat;
  webm?: KlipyMediaFormat;
  tinywebm?: KlipyMediaFormat;
  nanowebm?: KlipyMediaFormat;
  webp_transparent?: KlipyMediaFormat;
  tinywebp_transparent?: KlipyMediaFormat;
  nanowebp_transparent?: KlipyMediaFormat;
  gif_transparent?: KlipyMediaFormat;
  tinygif_transparent?: KlipyMediaFormat;
  nanogif_transparent?: KlipyMediaFormat;
}

export interface KlipyResult {
  id: string;
  title: string;
  media_formats: KlipyMediaFormats;
  created: number;
  content_description: string;
  itemurl: string;
  url: string;
  tags: string[];
  flags: string[];
  hasaudio: boolean;
  type?: 'gif' | 'sticker' | 'clip' | 'meme' | 'ad';
}

export interface KlipyCategory {
  searchterm: string;
  path: string;
  image: string;
  name: string;
}

export interface KlipySearchResponse {
  results: KlipyResult[];
  next: string;
}

export interface KlipyCategoriesResponse {
  tags: KlipyCategory[];
}

export interface KlipyTrendingTermsResponse {
  results: string[];
}

// GIF Picker Component Types

export interface GifImage {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  title: string;
  description: string;
  tags: string[];
  itemUrl: string;
  createdAt: Date;
}

export interface GifCategory {
  name: string;
  searchTerm: string;
  imageUrl: string;
}

export type Theme = 'light' | 'dark' | 'auto';

export type ContentFilter = 'off' | 'low' | 'medium' | 'high';

export interface GifPickerProps {
  /** Klipy API key (required) */
  klipyApiKey: string;
  /** Callback when a GIF is selected */
  onGifClick?: (gif: GifImage) => void;
  /** Theme of the picker */
  theme?: Theme;
  /** Auto focus search input */
  autoFocusSearch?: boolean;
  /** Content filter level */
  contentFilter?: ContentFilter;
  /** Client key for your application */
  clientKey?: string;
  /** Country code (ISO 3166-1) */
  country?: string;
  /** Locale (e.g., en_US) */
  locale?: string;
  /** Width of the picker */
  width?: number | string;
  /** Height of the picker */
  height?: number | string;
  /** Height of category items */
  categoryHeight?: number | string;
  /** Initial search term */
  initialSearchTerm?: string;
  /** Number of columns in the grid */
  columns?: number;
  /** Custom class name */
  className?: string;
  /** Custom labels for localization */
  labels?: GifPickerLabels;
}

/** Custom labels for localization */
export interface GifPickerLabels {
  /** Search input placeholder (default: "Search GIFs") */
  searchPlaceholder?: string;
  /** Trending section title (default: "Trending") */
  trendingTitle?: string;
  /** Categories section title (default: "Categories") */
  categoriesTitle?: string;
  /** Loading text (default: "Loading GIFs...") */
  loadingText?: string;
  /** No results text (default: "No GIFs found") */
  noResultsText?: string;
  /** Powered by text (default: "Powered by") */
  poweredByText?: string;
}
