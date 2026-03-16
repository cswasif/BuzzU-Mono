import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeContext';
import { SignalingProvider } from './src/context/SignalingContext';
import { MatchingProvider } from './src/context/MatchingContext';
import { sendMatchmakerDisconnect, useSessionStore } from './src/stores/sessionStore';
import { useMessageStore } from './src/stores/messageStore';
import { initPerfMonitor } from './src/utils/perfMonitor';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

const SocialLanding = React.lazy(() => import('./components/SocialLanding/SocialLanding'));
const VerificationPage = React.lazy(() => import('./src/pages/VerificationPage'));
const MatchPage = React.lazy(() => import('./src/pages/MatchPage'));
const ChatPage = React.lazy(() => import('./src/pages/ChatPage'));
const DashboardLayout = React.lazy(() => import('./src/layouts/DashboardLayout'));
const ChatNewPage = React.lazy(() => import('./src/pages/ChatNewPage'));
const VideoPage = React.lazy(() => import('./src/pages/VideoPage'));
const DmChatPage = React.lazy(() => import('./src/pages/DmChatPage'));
const appLoadingFallback = (
  <div className="min-h-screen w-full bg-background text-foreground flex items-center justify-center px-4">
    <div className="inline-flex items-center rounded-lg border border-border/40 bg-card px-4 py-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
    </div>
  </div>
);

const App = () => (
  <AppErrorBoundary>
    <SignalingProvider>
      <MatchingProvider>
        <ThemeProvider>
          <BrowserRouter>
            <React.Suspense fallback={appLoadingFallback}>
              <Routes>
                <Route path="/" element={<SocialLanding />} />
                <Route path="/verify" element={<VerificationPage />} />
                <Route path="/match" element={<MatchPage />} />

                {/* Dashboard layout — sidebar, header, modals defined once */}
                <Route element={<DashboardLayout />}>
                  <Route path="/chat/new" element={<ChatNewPage />} />
                  <Route path="/chat/new/:roomId" element={<ChatNewPage />} />
                  <Route path="/chat/text" element={<ChatNewPage />} />
                  <Route path="/chat/text/:roomId" element={<ChatNewPage />} />
                  <Route path="/chat/video" element={<VideoPage />} />
                  <Route path="/chat/dm/:friendId" element={<DmChatPage />} />
                </Route>

                <Route path="/chat/:roomId" element={<ChatPage />} />
              </Routes>
            </React.Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </MatchingProvider>
    </SignalingProvider>
  </AppErrorBoundary>
);

initPerfMonitor();

const container = document.getElementById('root');
if (container) {
  const rootKey = '_reactRoot';
  let root = (container as any)[rootKey];
  if (!root) {
    root = createRoot(container);
    (container as any)[rootKey] = root;
  }
  root.render(<App />);
}

// ── beforeunload cleanup (y-webrtc / PeerJS pattern) ──
// Notify the matchmaker that this peer is leaving so the slot is freed
// immediately instead of waiting for the Cloudflare Durable Object to
// detect the dead WebSocket (which can take up to 30 seconds).
window.addEventListener('beforeunload', () => {
  const { peerId, currentRoomId, leaveRoom } = useSessionStore.getState();

  // Clear in-memory messages to free blob URLs
  if (currentRoomId) {
    useMessageStore.getState().clearRoom(currentRoomId);
  }

  // Fire-and-forget disconnect — `keepalive: true` ensures the browser
  // sends the request even as the page is being unloaded.
  if (peerId && currentRoomId) {
    sendMatchmakerDisconnect(peerId, { useBeacon: true });
  }
});
