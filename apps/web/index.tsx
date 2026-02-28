import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeContext';
const SocialLanding = React.lazy(() => import('./components/SocialLanding/SocialLanding'));
const VerificationPage = React.lazy(() => import('./src/pages/VerificationPage'));
const MatchPage = React.lazy(() => import('./src/pages/MatchPage'));
const ChatPage = React.lazy(() => import('./src/pages/ChatPage'));
const ChatNewPage = React.lazy(() => import('./src/pages/ChatNewPage'));

const App = () => (
  <ThemeProvider>
    <BrowserRouter>
      <React.Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<SocialLanding />} />
          <Route path="/verify" element={<VerificationPage />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="/chat/new" element={<ChatNewPage />} />
          <Route path="/chat/:roomId" element={<ChatPage />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  </ThemeProvider>
);

const container = document.getElementById('root') || document.body;
const root = createRoot(container);
root.render(<App />);
