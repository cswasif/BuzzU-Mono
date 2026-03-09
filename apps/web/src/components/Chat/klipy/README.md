# GIF Picker React (Klipy Edition)

A modern, customizable GIF picker component for React applications using the [Klipy API](https://klipy.com) - a free Tenor alternative.

![GIF Picker Preview](https://raw.githubusercontent.com/micenx/gif-picker-react-klipy/refs/heads/main/screenshot.png)

## Features

- 🎨 **Light & Dark themes** with auto system detection
- 🔍 **Search GIFs** with debounced input
- 📂 **Browse categories** with thumbnail previews
- 🔥 **Trending terms** for quick access
- ♾️ **Infinite scroll** for seamless browsing
- 🌍 **Localization support** - customize all UI text
- 📱 **Responsive design** - works on all screen sizes
- ⚡ **TypeScript** - fully typed for better DX
- 🎯 **Zero dependencies** - only React required

## Installation

### Option 1: Install from GitHub

```bash
# npm
npm install github:micenx/gif-picker-react-klipy

# yarn
yarn add github:micenx/gif-picker-react-klipy

# pnpm
pnpm add github:micenx/gif-picker-react-klipy
```

```bash
npm install github:micenx/gif-picker-react-klipy
```

### Option 2: Copy to your project

Copy the `gif-picker` folder to your project's components or lib directory.

### Option 3: NPM Registry (coming soon!!)

```bash
npm install gif-picker-react-klipy
```

## Quick Start

1. Get a free API key from [Klipy Partner Portal](https://partner.klipy.com/)

2. Import and use the component:

```tsx
import { GifPicker } from './gif-picker';
import type { GifImage } from './gif-picker';

function App() {
  const handleGifClick = (gif: GifImage) => {
    console.log('Selected GIF:', gif.url);
  };

  return (
    <GifPicker
      klipyApiKey="YOUR_KLIPY_API_KEY"
      onGifClick={handleGifClick}
    />
  );
}
```

3. Import the styles in your app:

```tsx
import './gif-picker/styles.css';
```

Or import from the index:

```tsx
import { GifPicker } from './gif-picker'; // styles included
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `klipyApiKey` | `string` | **required** | Your Klipy API key |
| `onGifClick` | `(gif: GifImage) => void` | - | Callback when a GIF is selected |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color theme |
| `width` | `number \| string` | `350` | Width of the picker |
| `height` | `number \| string` | `450` | Height of the picker |
| `columns` | `number` | `2` | Number of columns in the GIF grid |
| `autoFocusSearch` | `boolean` | `true` | Auto focus search input on mount |
| `initialSearchTerm` | `string` | `''` | Initial search term |
| `contentFilter` | `'off' \| 'low' \| 'medium' \| 'high'` | `'off'` | Content filter level |
| `locale` | `string` | `'en_US'` | Locale for results (e.g., `'tr_TR'`, `'de_DE'`) |
| `country` | `string` | `'US'` | Country code (ISO 3166-1) |
| `clientKey` | `string` | `'gif-picker-react-klipy'` | Client identifier |
| `categoryHeight` | `number \| string` | `100` | Height of category thumbnails |
| `className` | `string` | `''` | Additional CSS class |
| `labels` | `GifPickerLabels` | - | Custom labels for localization |

## Localization

Customize UI text with the `labels` prop:

```tsx
<GifPicker
  klipyApiKey="YOUR_API_KEY"
  locale="tr_TR"
  country="TR"
  labels={{
    searchPlaceholder: "GIF Ara",
    trendingTitle: "Popüler",
    categoriesTitle: "Kategoriler",
    loadingText: "GIF'ler yükleniyor...",
    noResultsText: "GIF bulunamadı",
    poweredByText: "Sağlayan:",
  }}
/>
```

### Available Labels

| Label | Default | Description |
|-------|---------|-------------|
| `searchPlaceholder` | `'Search GIFs'` | Search input placeholder |
| `trendingTitle` | `'Trending'` | Trending section title |
| `categoriesTitle` | `'Categories'` | Categories section title |
| `loadingText` | `'Loading GIFs...'` | Loading indicator text |
| `noResultsText` | `'No GIFs found'` | Empty state text |
| `poweredByText` | `'Powered by'` | Attribution text |

## GifImage Object

When a GIF is selected, `onGifClick` receives a `GifImage` object:

```typescript
interface GifImage {
  id: string;
  url: string;           // Full quality GIF URL
  previewUrl: string;    // Smaller preview GIF URL
  width: number;
  height: number;
  title: string;
  description?: string;
  tags: string[];
  itemUrl?: string;      // Link to GIF page
  createdAt: Date;
}
```

## Theming

### Using Theme Prop

```tsx
// Light theme (default)
<GifPicker theme="light" />

// Dark theme
<GifPicker theme="dark" />

// Auto (follows system preference)
<GifPicker theme="auto" />
```

### Custom CSS Variables

Override CSS variables to customize colors:

```css
.gpr-picker {
  --gpr-bg-color: #ffffff;
  --gpr-secondary-bg: #f8f9fa;
  --gpr-text-color: #1a1a2e;
  --gpr-text-secondary: #6c757d;
  --gpr-border-color: #e9ecef;
  --gpr-highlight-color: #6366f1;
  --gpr-highlight-hover: #4f46e5;
  --gpr-input-bg: #f1f3f5;
  --gpr-hover-bg: rgba(99, 102, 241, 0.1);
  --gpr-radius: 12px;
  --gpr-radius-sm: 8px;
}
```

## Examples

### Basic Usage

```tsx
<GifPicker
  klipyApiKey="YOUR_API_KEY"
  onGifClick={(gif) => console.log(gif.url)}
/>
```

### Dark Theme with Custom Size

```tsx
<GifPicker
  klipyApiKey="YOUR_API_KEY"
  theme="dark"
  width={400}
  height={500}
  columns={3}
  onGifClick={(gif) => sendMessage(gif.url)}
/>
```

### Localized (Turkish)

```tsx
<GifPicker
  klipyApiKey="YOUR_API_KEY"
  locale="tr_TR"
  country="TR"
  labels={{
    searchPlaceholder: "GIF Ara",
    trendingTitle: "Popüler",
    categoriesTitle: "Kategoriler",
    loadingText: "Yükleniyor...",
    noResultsText: "Sonuç bulunamadı",
  }}
  onGifClick={handleGif}
/>
```

### With Content Filter

```tsx
<GifPicker
  klipyApiKey="YOUR_API_KEY"
  contentFilter="high"
  onGifClick={handleGif}
/>
```

## Migration from Tenor

If you're migrating from Tenor API, Klipy provides a compatible API. Simply:

1. Get a Klipy API key from [partner.klipy.com](https://partner.klipy.com/)
2. Replace your Tenor API integration with this component
3. See [Klipy Migration Guide](https://docs.klipy.com/migrate-from-tenor) for more details

## API Reference

### KlipyApi Class

You can also use the API client directly:

```tsx
import { KlipyApi } from './gif-picker';

const api = new KlipyApi({
  apiKey: 'YOUR_API_KEY',
  locale: 'en_US',
  country: 'US',
});

// Search GIFs
const results = await api.search('funny cats');
console.log(results.gifs);

// Get trending
const trending = await api.getTrending();

// Get categories
const categories = await api.getCategories();

// Get trending search terms
const terms = await api.getTrendingTerms();
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

MIT License - feel free to use in personal and commercial projects.

## Credits

- GIF data provided by [Klipy](https://klipy.com)
- Inspired by [gif-picker-react](https://github.com/MrBartusek/gif-picker-react)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.



