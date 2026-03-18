# BuzzU Core Files

## Monorepo Core

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`

## Web App Entry and Build

- `apps/web/index.tsx`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/wrangler.toml`

## Primary App Shell and Pages

- `apps/web/src/layouts/DashboardLayout.tsx`
- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/pages/ChatNewPage.tsx`
- `apps/web/src/pages/VideoPage.tsx`
- `apps/web/src/pages/DmChatPage.tsx`
- `apps/web/src/pages/MatchPage.tsx`

## Chat Runtime Core

- `apps/web/src/components/Chat/ChatArea.tsx`
- `apps/web/src/components/Chat/VideoChatArea.tsx`
- `apps/web/src/components/Chat/DmChatArea.tsx`
- `apps/web/src/components/Chat/Sidebar.tsx`
- `apps/web/src/components/Chat/MessageList.tsx`
- `apps/web/src/components/Chat/MessageInput.tsx`

## Realtime Context and Hooks

- `apps/web/src/context/SignalingContext.tsx`
- `apps/web/src/context/MatchingContext.tsx`
- `apps/web/src/context/DmSignalingContext.tsx`
- `apps/web/src/hooks/useSignaling.ts`
- `apps/web/src/hooks/useMatching.ts`
- `apps/web/src/hooks/useWebRTC.ts`
- `apps/web/src/hooks/useCrypto.ts`

## State Stores

- `apps/web/src/stores/sessionStore.ts`
- `apps/web/src/stores/messageStore.ts`
- `apps/web/src/stores/screenShareStore.ts`
- `apps/web/src/stores/voiceChatStore.ts`

## Cloudflare Workers Core

- `apps/signaling-worker/src/lib.rs`
- `apps/matchmaker-worker/src/lib.rs`
- `apps/reputation-worker/src/lib.rs`

## Shared WASM Core

- `packages/wasm/src/lib.rs`
- `packages/wasm/src/crypto/signal.rs`
- `packages/wasm/src/stun_prober/mod.rs`

## Core CSS Files

- Global and Landing
  - `apps/web/styles.css`
- Chat and Match
  - `apps/web/src/chat-styles.css`
  - `apps/web/src/pages/MatchPage.tsx` imports `src/chat-styles.css`
  - `apps/web/src/pages/ChatPage.tsx` imports `src/chat-styles.css`
- Dashboard
  - `apps/web/src/dashboard_updated.css`
  - `apps/web/src/dashboard.css`
  - `apps/web/src/components/DashboardUpdated/dashboard.css`
  - `apps/web/src/layouts/DashboardLayout.tsx` imports `src/dashboard_updated.css`
- Verification
  - `apps/web/src/verify.css`
  - `apps/web/src/pages/VerificationPage.tsx` imports `src/verify.css`
- Video Match
  - `apps/web/src/video-match/video-match.css`
  - `apps/web/src/video-match/VideoMatchPage.tsx` imports `src/video-match/video-match.css`
- GIF Picker
  - `apps/web/src/components/Chat/klipy/styles.css`
  - `apps/web/src/components/Chat/GifPicker.tsx` imports `components/Chat/klipy/styles.css`
- Theme
  - `apps/web/src/tailwind-theme.css`

## Additional CSS (Legacy or Isolated)

- `apps/web/chitchat-dashboard.css`
- `apps/web/chitchat-dashboard/index.css`
- `apps/web/x-_-twitter-clone/styles.css`
