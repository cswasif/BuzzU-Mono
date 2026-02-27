
import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'yellow' | 'lavender';

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
  // Dark Mode with Lavender Accent
  lavender: {
    background: '#000000',
    textPrimary: '#e7e9ea',
    textSecondary: '#71767b',
    line: '#2f3336',
    buttonBorder: '#536471',
    buttonHoverBg: 'rgba(239, 243, 244, 0.1)',
    accent: '#8d96f6', // Lavender/Purple
    accentHoverBg: 'rgba(141, 150, 246, 0.1)',
  },
};

const ThemeContext = createContext<ThemeContextType>({
  theme: 'yellow',
  toggleTheme: () => {},
  colors: themes.yellow,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('yellow');

  const toggleTheme = () => {
    setTheme((prev) => {
      // Cycle: yellow -> lavender -> light -> dark -> yellow
      if (prev === 'yellow') return 'lavender';
      if (prev === 'lavender') return 'light';
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
