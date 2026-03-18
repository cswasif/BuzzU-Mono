interface PagesFunction {
  (context: { request: Request; env: unknown; next: () => Promise<Response>; params: unknown; data: unknown }): Promise<Response>;
}

interface LinkPreviewPayload {
  url: string;
  title: string;
  description: string;
  siteName: string;
  displayUrl: string;
  image: string | null;
  favicon: string | null;
}

const MAX_HTML_LENGTH = 300_000;
const REQUEST_TIMEOUT_MS = 4_500;
const IMAGE_EXTENSIONS = /\.(apng|avif|gif|jpe?g|jfif|png|svg|webp|bmp|ico)(\?.*)?$/i;

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=900, s-maxage=3600",
};

const OEMBED_PROVIDERS = [
  {
    hosts: ["imgur.com", "i.imgur.com"],
    endpoint: "https://api.imgur.com/oembed",
  },
  {
    hosts: ["youtube.com", "www.youtube.com", "youtu.be"],
    endpoint: "https://www.youtube.com/oembed",
  },
  {
    hosts: ["vimeo.com", "www.vimeo.com"],
    endpoint: "https://vimeo.com/api/oembed.json",
  },
] as const;

function normalizeInputUrl(raw: string) {
  const candidate = raw.trim();
  if (!candidate) {
    return null;
  }

  const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isLikelyDirectImageUrl(url: URL) {
  if (IMAGE_EXTENSIONS.test(url.pathname)) {
    return true;
  }
  if (url.hostname === "encrypted-tbn.gstatic.com") {
    return true;
  }
  if (url.hostname === "lh3.googleusercontent.com") {
    return true;
  }
  return false;
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }

  if (parts[0] === 10 || parts[0] === 127) {
    return true;
  }
  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return false;
}

function isBlockedHostname(hostname: string) {
  const value = hostname.toLowerCase();
  if (
    value === "localhost" ||
    value === "::1" ||
    value.endsWith(".local") ||
    value.endsWith(".internal") ||
    value.startsWith("169.254.") ||
    value.startsWith("fe80:") ||
    value.startsWith("fc") ||
    value.startsWith("fd")
  ) {
    return true;
  }

  if (isPrivateIpv4(value)) {
    return true;
  }

  return false;
}

function extractMetaContent(html: string, key: string, attrName: "property" | "name") {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patternA = new RegExp(`<meta[^>]*${attrName}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const patternB = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escapedKey}["'][^>]*>`, "i");
  const first = html.match(patternA)?.[1] ?? html.match(patternB)?.[1] ?? "";
  return first.trim();
}

function extractTitle(html: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return titleMatch.replace(/\s+/g, " ").trim();
}

function extractFavicon(html: string) {
  const iconMatch =
    html.match(/<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i)?.[1] ??
    "";
  return iconMatch.trim();
}

function extractFirstImageSrc(html: string) {
  const imageMatch = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
  if (!imageMatch) {
    return "";
  }
  const normalized = imageMatch.trim();
  if (!normalized || normalized.startsWith("data:")) {
    return "";
  }
  return normalized;
}

function resolveMaybeUrl(value: string, baseUrl: string) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function filenameFromUrl(url: URL) {
  const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!segment) {
    return "";
  }
  const decoded = decodeURIComponent(segment).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  return decoded.trim();
}

function makeDisplayUrl(url: URL) {
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.hostname}${path}${url.search}`.slice(0, 120);
}

function makeFallbackPayload(url: URL): LinkPreviewPayload {
  const titleBase = filenameFromUrl(url) || url.hostname;
  const title = titleBase.charAt(0).toUpperCase() + titleBase.slice(1);
  return {
    url: url.toString(),
    title,
    description: "",
    siteName: url.hostname.replace(/^www\./, ""),
    displayUrl: makeDisplayUrl(url),
    image: null,
    favicon: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`,
  };
}

function matchOEmbedProvider(hostname: string) {
  const normalized = hostname.toLowerCase();
  return OEMBED_PROVIDERS.find(provider => provider.hosts.some(host => normalized === host || normalized.endsWith(`.${host}`))) ?? null;
}

async function fetchOEmbedPreview(targetUrl: URL) {
  const provider = matchOEmbedProvider(targetUrl.hostname);
  if (!provider) {
    return null;
  }

  try {
    const endpoint = `${provider.endpoint}?url=${encodeURIComponent(targetUrl.toString())}&format=json`;
    const response = await fetchWithTimeout(endpoint, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      return null;
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("json")) {
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const description = typeof data.author_name === "string" ? data.author_name.trim() : "";
    const siteName =
      (typeof data.provider_name === "string" && data.provider_name.trim()) ||
      targetUrl.hostname.replace(/^www\./, "");
    const imageCandidate =
      (typeof data.thumbnail_url === "string" && data.thumbnail_url.trim()) ||
      (typeof data.url === "string" && data.url.trim()) ||
      "";

    return {
      title,
      description,
      siteName,
      image: resolveMaybeUrl(imageCandidate, targetUrl.toString()),
    };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(requestUrl: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(requestUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "BuzzU-LinkPreviewBot/1.0",
        accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const rawTarget = requestUrl.searchParams.get("url") ?? "";
  const parsedTarget = normalizeInputUrl(rawTarget);

  if (!parsedTarget) {
    return new Response(JSON.stringify({ error: "invalid_url" }), { status: 400, headers: JSON_HEADERS });
  }

  if (isBlockedHostname(parsedTarget.hostname)) {
    return new Response(JSON.stringify({ error: "blocked_host" }), { status: 400, headers: JSON_HEADERS });
  }

  const fallback: LinkPreviewPayload = {
    ...makeFallbackPayload(parsedTarget),
    image: isLikelyDirectImageUrl(parsedTarget) ? parsedTarget.toString() : null,
  };

  try {
    const oEmbedPreview = await fetchOEmbedPreview(parsedTarget);
    const response = await fetchWithTimeout(parsedTarget.toString(), REQUEST_TIMEOUT_MS);
    const finalUrl = new URL(response.url || parsedTarget.toString());
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const isDirectImage = contentType.startsWith("image/") || isLikelyDirectImageUrl(finalUrl);

    if (isDirectImage) {
      const directImagePayload: LinkPreviewPayload = {
        ...makeFallbackPayload(finalUrl),
        image: finalUrl.toString(),
      };
      return new Response(JSON.stringify(directImagePayload), { headers: JSON_HEADERS });
    }

    if (!contentType.includes("text/html")) {
      const nonHtmlPayload: LinkPreviewPayload = {
        ...makeFallbackPayload(finalUrl),
        title: oEmbedPreview?.title || makeFallbackPayload(finalUrl).title,
        description: oEmbedPreview?.description || "",
        siteName: oEmbedPreview?.siteName || makeFallbackPayload(finalUrl).siteName,
        image: oEmbedPreview?.image || (isLikelyDirectImageUrl(finalUrl) ? finalUrl.toString() : null),
      };
      return new Response(JSON.stringify(nonHtmlPayload), { headers: JSON_HEADERS });
    }

    const html = (await response.text()).slice(0, MAX_HTML_LENGTH);
    const title =
      extractMetaContent(html, "og:title", "property") ||
      extractMetaContent(html, "twitter:title", "name") ||
      extractMetaContent(html, "twitter:text:title", "name") ||
      oEmbedPreview?.title ||
      extractTitle(html) ||
      fallback.title;
    const description =
      extractMetaContent(html, "og:description", "property") ||
      extractMetaContent(html, "twitter:description", "name") ||
      extractMetaContent(html, "description", "name") ||
      oEmbedPreview?.description ||
      "";
    const siteName =
      extractMetaContent(html, "og:site_name", "property") ||
      oEmbedPreview?.siteName ||
      finalUrl.hostname.replace(/^www\./, "");
    const imageCandidate =
      extractMetaContent(html, "og:image:secure_url", "property") ||
      extractMetaContent(html, "og:image", "property") ||
      extractMetaContent(html, "twitter:image", "name") ||
      extractMetaContent(html, "twitter:image:src", "name") ||
      extractFirstImageSrc(html);
    const faviconCandidate = extractFavicon(html);

    const payload: LinkPreviewPayload = {
      url: finalUrl.toString(),
      title,
      description,
      siteName,
      displayUrl: makeDisplayUrl(finalUrl),
      image: resolveMaybeUrl(imageCandidate, finalUrl.toString()) || oEmbedPreview?.image || null,
      favicon: resolveMaybeUrl(faviconCandidate, finalUrl.toString()) || `https://www.google.com/s2/favicons?domain=${finalUrl.hostname}&sz=64`,
    };

    return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
  } catch {
    return new Response(JSON.stringify(fallback), { headers: JSON_HEADERS });
  }
};
