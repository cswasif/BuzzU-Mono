import React from 'react';
import { createRoot } from 'react-dom/client';
import SocialLanding from './components/SocialLanding/SocialLanding';
import { ThemeProvider } from './components/ThemeContext';
import './styles.css';

const container = document.getElementById('root') || document.body;
const root = createRoot(container);
root.render(
  <ThemeProvider>
    <SocialLanding />
  </ThemeProvider>
);
