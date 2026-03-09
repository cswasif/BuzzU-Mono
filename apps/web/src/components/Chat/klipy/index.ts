// GIF Picker React - Klipy Edition
// A GIF picker component using Klipy API (Tenor alternative)

export { GifPicker } from './components/GifPicker';
export { KlipyApi } from './klipy-api';

export type {
  GifPickerProps,
  GifPickerLabels,
  GifImage,
  GifCategory,
  Theme,
  ContentFilter,
  KlipyResult,
  KlipyMediaFormat,
  KlipyMediaFormats,
  KlipySearchResponse,
  KlipyCategoriesResponse,
} from './types';

// Import styles
import './styles.css';
