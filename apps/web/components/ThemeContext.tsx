
import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'yellow' | 'emerald' | 'aura';

interface ThemeColors {
  background: string;
  textPrimary: string;
  textSecondary: string;
  line: string;
  buttonBorder: string;
  buttonHoverBg: string; // Background for standard buttons on hover
  accent: string;        // Primary accent color (links, primary buttons)
  accentHoverBg: string; // Background for outlined accent buttons on hover
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  colors: ThemeColors;
}

const themes: Record<Theme, ThemeColors> = {
  // Deep Dark with Yellow Accent (Default)
  yellow: {
    background: 'hsl(33, 25%, 6%)', // #13110C
    textPrimary: '#ffffff',
    textSecondary: 'hsl(33, 25%, 60%)',
    line: 'hsl(33, 25%, 16%)',
    buttonBorder: 'hsl(33, 25%, 26%)',
    buttonHoverBg: 'rgba(255, 255, 255, 0.1)',
    accent: '#FFD700', // Gold/Yellow
    accentHoverBg: 'rgba(255, 215, 0, 0.1)',
  },
  // Elite Theme with Mesh Gradient Background
  aura: {
    background: '#0a0a1a', // Deep Midnight Blue
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.6)',
    line: 'rgba(255, 255, 255, 0.1)',
    buttonBorder: 'rgba(255, 255, 255, 0.2)',
    buttonHoverBg: 'rgba(255, 255, 255, 0.05)',
    accent: '#00ffff', // Electric Cyan
    accentHoverBg: 'rgba(0, 255, 255, 0.1)',
  },
  // Standard Dark with Green/Cyan Accent
  dark: {
    background: '#000000',
    textPrimary: '#e7e9ea',
    textSecondary: '#71767b',
    line: '#2f3336',
    buttonBorder: '#536471',
    buttonHoverBg: 'rgba(239, 243, 244, 0.1)',
    accent: '#33ff8b', // Green/Cyan
    accentHoverBg: 'rgba(51, 255, 139, 0.1)',
  },
  // Light Mode with Magenta/Pink Accent
  light: {
    background: '#ffffff',
    textPrimary: '#0f1419',
    textSecondary: '#536471',
    line: '#cfd9de',
    buttonBorder: '#cfd9de',
    buttonHoverBg: 'rgba(15, 20, 25, 0.1)',
    accent: '#ee81ee', // Magenta/Pink
    accentHoverBg: 'rgba(238, 129, 238, 0.1)',
  },
  // Dark Mode with Emerald Accent
  emerald: {
    background: '#000000',
    textPrimary: '#e7e9ea',
    textSecondary: '#71767b',
    line: '#2f3336',
    buttonBorder: '#536471',
    buttonHoverBg: 'rgba(239, 243, 244, 0.1)',
    accent: '#10b981', // Emerald
    accentHoverBg: 'rgba(16, 185, 129, 0.1)',
  },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'aura',
  toggleTheme: () => { },
  colors: themes.aura,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('aura');
  const colors = themes[theme];

  useEffect(() => {
    // Helper to convert hex to RGB components
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 0, 0';
    };

    // Inject CSS variables into document root for global availability
    const root = document.documentElement;
    root.style.setProperty('--accent-hover-bg', colors.accentHoverBg);
    root.style.setProperty('--button-hover-bg', colors.buttonHoverBg);
    root.style.setProperty('--theme-bg', colors.background);
    root.style.setProperty('--theme-bg-rgb', hexToRgb(colors.background));
    root.style.setProperty('--theme-text', colors.textPrimary);
    root.style.setProperty('--theme-text-secondary', colors.textSecondary);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-line', colors.line);
    root.style.setProperty('--theme-button-border', colors.buttonBorder);

    // Sync body styles
    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.textPrimary;

    // Update color-scheme for system UI
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';

    // Add data-theme attribute for CSS targeting
    root.setAttribute('data-theme', theme);
  }, [colors, theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      // Cycle: yellow -> aura -> lavender -> light -> dark -> yellow
      if (prev === 'yellow') return 'aura';
      if (prev === 'aura') return 'emerald';
      if (prev === 'emerald') return 'light';
      if (prev === 'light') return 'dark';
      return 'yellow';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors: themes[theme] }}>
      {children}
    </ThemeContext.Provider>
  );
};
