import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SocialLanding from './components/SocialLanding/SocialLanding';
import { ThemeProvider } from './components/ThemeContext';
import { MatchPage } from './src/pages/MatchPage';
import { ChatPage } from './src/pages/ChatPage';
import { ChatNewPage } from './src/pages/ChatNewPage';
import { VerificationPage } from './src/pages/VerificationPage';
import './styles.css';
import './src/chat-styles.css';
import './src/dashboard_updated.css';

const App = () => (
  <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SocialLanding />} />
        <Route path="/verify" element={<VerificationPage />} />
        <Route path="/match" element={<MatchPage />} />
        <Route path="/chat/new" element={<ChatNewPage />} />
        <Route path="/chat/:roomId" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  </ThemeProvider>
);

const container = document.getElementById('root') || document.body;
const root = createRoot(container);
root.render(<App />);
