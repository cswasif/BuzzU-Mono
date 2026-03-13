import type {
  KlipySearchResponse,
  KlipyCategoriesResponse,
  KlipyTrendingTermsResponse,
  KlipyResult,
  GifImage,
  GifCategory,
  ContentFilter,
} from './types';

const KLIPY_API_BASE = 'https://api.klipy.com/v2';

export interface KlipyApiConfig {
  apiKey: string;
  clientKey?: string;
  country?: string;
  locale?: string;
  contentFilter?: ContentFilter;
}

function mapContentFilter(filter: ContentFilter): string {
  switch (filter) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    case 'off':
    default:
      return 'off';
  }
}

function transformResult(result: KlipyResult): GifImage {
  const gif = result.media_formats.gif || result.media_formats.mediumgif;
  const preview = result.media_formats.tinygif || result.media_formats.nanogif;

  return {
    id: result.id,
    url: gif?.url || '',
    previewUrl: preview?.url || gif?.url || '',
    width: gif?.dims?.[0] || 0,
    height: gif?.dims?.[1] || 0,
    title: result.title,
    description: result.content_description,
    tags: result.tags || [],
    itemUrl: result.itemurl,
    createdAt: new Date(result.created * 1000),
  };
}

const FETCH_TIMEOUT = 15000; // 15 seconds timeout

function redactSensitiveQuery(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('key')) {
      parsed.searchParams.set('key', '[redacted]');
    }
    if (parsed.searchParams.has('client_key')) {
      parsed.searchParams.set('client_key', '[redacted]');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - API did not respond in time');
    }
    throw error;
  }
}

export class KlipyApi {
  private config: KlipyApiConfig;

  constructor(config: KlipyApiConfig) {
    this.config = config;
  }

  private buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(`${KLIPY_API_BASE}${endpoint}`);
    
    // Add API key
    url.searchParams.set('key', this.config.apiKey);
    
    // Add client key if provided
    if (this.config.clientKey) {
      url.searchParams.set('client_key', this.config.clientKey);
    }
    
    // Add country if provided
    if (this.config.country) {
      url.searchParams.set('country', this.config.country);
    }
    
    // Add locale if provided
    if (this.config.locale) {
      url.searchParams.set('locale', this.config.locale);
    }
    
    // Add content filter
    if (this.config.contentFilter) {
      url.searchParams.set('contentfilter', mapContentFilter(this.config.contentFilter));
    }
    
    // Add additional params
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
    
    return url.toString();
  }

  async search(query: string, limit = 20, pos?: string): Promise<{ gifs: GifImage[]; next: string }> {
    const url = this.buildUrl('/search', {
      q: query,
      limit,
      pos,
      media_filter: 'gif,tinygif',
    });

    console.log('[Klipy API] Searching for:', query, 'URL:', redactSensitiveQuery(url));

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error('[Klipy API] Search failed:', response.status, response.statusText);
      throw new Error(`Klipy API error: ${response.status}`);
    }

    const data: KlipySearchResponse = await response.json();
    console.log('[Klipy API] Search results:', data.results?.length || 0, 'GIFs');
    
    return {
      gifs: (data.results || [])
        .filter(r => r.type !== 'ad')
        .map(transformResult),
      next: data.next,
    };
  }

  async getTrending(limit = 20, pos?: string): Promise<{ gifs: GifImage[]; next: string }> {
    const url = this.buildUrl('/featured', {
      limit,
      pos,
      media_filter: 'gif,tinygif',
    });

    console.log('[Klipy API] Fetching trending, URL:', redactSensitiveQuery(url));

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error('[Klipy API] Trending failed:', response.status, response.statusText);
      throw new Error(`Klipy API error: ${response.status}`);
    }

    const data: KlipySearchResponse = await response.json();
    console.log('[Klipy API] Trending results:', data.results?.length || 0, 'GIFs');
    
    return {
      gifs: (data.results || [])
        .filter(r => r.type !== 'ad')
        .map(transformResult),
      next: data.next,
    };
  }

  async getCategories(): Promise<GifCategory[]> {
    const url = this.buildUrl('/categories', {});

    console.log('[Klipy API] Fetching categories');

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error('[Klipy API] Categories failed:', response.status, response.statusText);
      throw new Error(`Klipy API error: ${response.status}`);
    }

    const data: KlipyCategoriesResponse = await response.json();
    console.log('[Klipy API] Categories loaded:', data.tags?.length || 0);
    
    return (data.tags || []).map(tag => ({
      name: tag.name,
      searchTerm: tag.searchterm,
      imageUrl: tag.image,
    }));
  }

  async getTrendingTerms(limit = 10): Promise<string[]> {
    const url = this.buildUrl('/trending_terms', { limit });

    console.log('[Klipy API] Fetching trending terms');

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error('[Klipy API] Trending terms failed:', response.status, response.statusText);
      throw new Error(`Klipy API error: ${response.status}`);
    }

    const data: KlipyTrendingTermsResponse = await response.json();
    console.log('[Klipy API] Trending terms loaded:', data.results?.length || 0);
    return data.results || [];
  }

  async registerShare(gifId: string, query?: string): Promise<void> {
    const url = this.buildUrl('/registershare', {
      id: gifId,
      q: query,
    });

    try {
      await fetchWithTimeout(url, 5000); // 5 second timeout for share
    } catch {
      // Silently fail for share registration
    }
  }
}
