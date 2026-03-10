# BuzzU Ephemeral Rooms Plan (Mesh, No SFU)

## Goals
- Allow users to create 1 active room at a time
- Keep rooms small to avoid mesh scaling issues
- Make rooms short‑lived and automatically cleaned up
- Preserve the random‑chat vibe while enabling small groups

## Key Constraints (Mesh Reality)
- Mesh opens one peer connection per participant pair, which scales as O(N²)
- Multi‑peer mesh is CPU/bandwidth heavy; large rooms degrade quickly
- Practical caps for consumer browsers:
  - Audio‑only: 6–8 max
  - Audio + video: 3–5 max
- WebRTC mesh experiences high resource use as participants grow (example notes about CPU/bandwidth impact and high peer counts in WebRTC‑Experiment)
  - Source: https://github.com/muaz-khan/WebRTC-Experiment/blob/master/webrtc-broadcasting/README.md

## Room Policy (Proposed)
- Room type: ephemeral, random ID (no persistence)
- Limit: 4 or 5 members max (configurable by environment)
- User can have only 1 active room (host or member) at a time
- Auto‑expire room after X minutes of inactivity
- Auto‑close room when last user leaves

## User Flow
- Create Room:
  - System generates a room code
  - Host shares the code/link
  - If host leaves, room closes
- Join Room:
  - User enters code or link
  - If room full, reject with “Room Full”
- Discovery (optional):
  - Disable public listing to keep room spam low

## Signaling/Server Controls
- Enforce MAX_PEERS_PER_ROOM at signaling layer
- Rate limit Join/Offer/Answer/ICE messages per peer
- Reject if user is already in a room
- Clear stale peers after timeout
- Enforce message payload size limits

## Client Controls
- Prevent local user from creating or joining a second room
- Show live member count and max capacity
- Disable “Join” button when room is full
- Warn about best experience: headphones and stable internet

## Room Lifecycle
- Create → Active
- Active + no media packets for X seconds → Idle
- Idle for Y seconds → Expire
- On expire: notify clients and close room

## Suggested Defaults
- Max members: 5
- Idle threshold: 60 seconds
- Expire timeout: 5–10 minutes
- Per‑peer message rate: 20–30 msg/sec

## Enhancements (Best ROI)
1. Adaptive quality for groups
   - Lower video bitrate or disable video beyond 3 participants
2. Audio‑only rooms by default
   - Make “Video on” opt‑in for small rooms
3. Join‑code UX improvements
   - Copy button, short links, QR
4. Host tools
   - Kick, lock room, end room
5. Health diagnostics
   - Show packet loss, RTT, uplink bitrate

## References (GitHub MCP)
- Mesh scaling and heavy CPU/bandwidth with multiple peer connections:
  https://github.com/muaz-khan/WebRTC-Experiment/blob/master/webrtc-broadcasting/README.md
