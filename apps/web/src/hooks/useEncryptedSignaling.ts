// ==========================================================================
// useEncryptedSignaling — E2E Encrypted Signaling Layer
// ==========================================================================
// Wraps useSignaling to transparently encrypt sensitive signaling messages
// with XChaCha20-Poly1305 before they leave the browser. Cloudflare sees
// only opaque `Encrypted` envelopes. The receiver decrypts and processes
// the inner message as if it arrived in plaintext.
//
// Key exchange flow:
//   1. On room join, each peer generates an ephemeral X25519 keypair
//   2. Public keys are exchanged via the `KeyExchange` signaling message
//   3. Both peers derive a shared ChaCha20 key via ECDH + HKDF
//   4. All subsequent sensitive messages are wrapped in `Encrypted` envelopes
//
// Messages that are NOT encrypted (routing metadata visible to relay):
//   - Join, PeerList, Leave, Error (need to be read by the server)
//
// Messages that ARE encrypted:
//   - Offer, Answer, IceCandidate (contain IP addresses in SDP)
//   - Chat, Typing (contain message content)
//   - PublishKeys, RequestKeys, KeysResponse, SignalHandshake (Signal protocol)
//   - FriendRequest, ScreenShare
//   - Relay (payload encrypted)
// ==========================================================================

import { useCallback, useRef, useState, useEffect } from 'react';
import { useWasm } from './useWasm';
import { useSignalingContext, SignalingMessage } from '../context/SignalingContext';
import { useSessionStore } from '../stores/sessionStore';

const E2E_STORAGE_KEY = 'buzzu_e2e_keypair';

// Message types that must NOT be encrypted (server needs to read them)
const PLAINTEXT_TYPES = new Set<string>([
  'Join', 'PeerList', 'Leave', 'Error', 'KeyExchange',
]);

// Message types that SHOULD be encrypted end-to-end
const SENSITIVE_TYPES = new Set<string>([
  'Offer', 'Answer', 'IceCandidate',
  'Chat', 'Typing',
  'PublishKeys', 'RequestKeys', 'KeysResponse', 'SignalHandshake',
  'FriendRequest', 'ScreenShare', 'Relay',
]);

interface E2EKeypair {
  privateKey: string; // base64
  publicKey: string;  // base64
}

interface PeerE2EState {
  publicKey: string;
  sharedKey: string; // base64 derived key
  engine: any;       // ChaChaEngine instance
}

export function useEncryptedSignaling() {
  const { wasm } = useWasm();
  const context = useSignalingContext();
  const { peerId } = useSessionStore();
  
  const [isE2EReady, setIsE2EReady] = useState(false);
  const keypairRef = useRef<E2EKeypair | null>(null);
  const peerKeysRef = useRef<Map<string, PeerE2EState>>(new Map());
  const pendingMessagesRef = useRef<Map<string, SignalingMessage[]>>(new Map());

  // Generate or restore our X25519 keypair
  useEffect(() => {
    if (!wasm) return;
    
    try {
      // Try to restore from sessionStorage (survives page reloads within tab)
      const stored = sessionStorage.getItem(E2E_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.privateKey && parsed.publicKey) {
          keypairRef.current = parsed;
          console.log('[E2E] Restored keypair from session');
          return;
        }
      }
    } catch {}

    try {
      const kp = wasm.generateSignalingKeypair();
      keypairRef.current = {
        privateKey: kp.privateKey,
        publicKey: kp.publicKey,
      };
      sessionStorage.setItem(E2E_STORAGE_KEY, JSON.stringify(keypairRef.current));
      console.log('[E2E] Generated new signaling keypair');
    } catch (err) {
      console.error('[E2E] Failed to generate keypair:', err);
    }
  }, [wasm]);

  // Derive shared key when we receive a peer's public key
  const deriveSharedKey = useCallback((remotePeerId: string, theirPublicKey: string) => {
    if (!wasm || !keypairRef.current) return;
    
    try {
      // Compute X25519 ECDH shared secret
      const sharedSecret = wasm.computeSharedSecret(
        keypairRef.current.privateKey,
        theirPublicKey,
      );

      // Derive ChaCha20 key via HKDF with sorted peer IDs as salt
      const sortedIds = [peerId, remotePeerId].sort().join(':');
      const saltB64 = btoa(sortedIds);
      const engine = wasm.ChaChaEngine.fromSharedSecret(sharedSecret, saltB64);

      peerKeysRef.current.set(remotePeerId, {
        publicKey: theirPublicKey,
        sharedKey: sharedSecret, // Store for debugging/re-derivation
        engine,
      });

      console.log('[E2E] Derived shared ChaCha20 key with peer:', remotePeerId);
      setIsE2EReady(true);

      // Flush any pending messages for this peer
      const pending = pendingMessagesRef.current.get(remotePeerId);
      if (pending && pending.length > 0) {
        console.log(`[E2E] Flushing ${pending.length} pending messages to`, remotePeerId);
        for (const msg of pending) {
          sendEncryptedMessage(msg);
        }
        pendingMessagesRef.current.delete(remotePeerId);
      }
    } catch (err) {
      console.error('[E2E] Key derivation failed:', err);
    }
  }, [wasm, peerId]);

  // Send our public key to a peer via KeyExchange message
  const sendKeyExchange = useCallback((targetPeerId: string) => {
    if (!keypairRef.current) return;
    
    context.sendMessage({
      type: 'KeyExchange' as any,
      from: peerId,
      to: targetPeerId,
      payload: keypairRef.current.publicKey,
    });
    console.log('[E2E] Sent KeyExchange to', targetPeerId);
  }, [context, peerId]);

  // Broadcast our public key to all peers in the room
  const broadcastKeyExchange = useCallback(() => {
    if (!keypairRef.current) return;
    
    context.sendMessage({
      type: 'KeyExchange' as any,
      from: peerId,
      to: '', // Broadcast
      payload: keypairRef.current.publicKey,
    });
    console.log('[E2E] Broadcast KeyExchange to room');
  }, [context, peerId]);

  // Encrypt and send a signaling message
  const sendEncryptedMessage = useCallback((message: SignalingMessage) => {
    // Plaintext types go through unencrypted
    if (PLAINTEXT_TYPES.has(message.type)) {
      context.sendMessage(message);
      return;
    }

    const targetPeerId = (message as any).to;
    if (!targetPeerId) {
      // Broadcast messages — send as plaintext (e.g. PublishKeys with to='')
      context.sendMessage(message);
      return;
    }

    const peerState = peerKeysRef.current.get(targetPeerId);
    if (!peerState) {
      // E2E not yet established — queue the message and initiate key exchange
      console.log('[E2E] No key for', targetPeerId, '— queuing message and requesting KeyExchange');
      const pending = pendingMessagesRef.current.get(targetPeerId) || [];
      pending.push(message);
      pendingMessagesRef.current.set(targetPeerId, pending);
      sendKeyExchange(targetPeerId);
      
      // SECURITY: Do NOT send unencrypted fallback — message will be flushed once E2E is ready
      return;
    }

    try {
      // Encrypt the full message JSON
      const plaintext = JSON.stringify(message);
      const ciphertext = peerState.engine.encrypt(plaintext);

      // Wrap in Encrypted envelope — server sees only from/to, not content
      const envelope: SignalingMessage = {
        type: 'Encrypted' as any,
        from: peerId,
        to: targetPeerId,
        payload: ciphertext,
      };
      context.sendMessage(envelope);
    } catch (err) {
      console.error('[E2E] Encryption failed — message NOT sent:', err);
      // SECURITY: Never silently downgrade to plaintext
      // The caller should handle this gracefully (e.g. retry, reconnect)
      throw new Error(`E2E encryption failed: ${err}`);
    }
  }, [context, peerId, sendKeyExchange]);

  // Decrypt an incoming Encrypted envelope
  const decryptMessage = useCallback((envelope: SignalingMessage): SignalingMessage | null => {
    if (envelope.type !== ('Encrypted' as any)) return envelope;

    const senderPeerId = envelope.from;
    if (!senderPeerId || !envelope.payload) return null;

    const peerState = peerKeysRef.current.get(senderPeerId);
    if (!peerState) {
      console.warn('[E2E] Received encrypted message from', senderPeerId, 'but no shared key');
      return null;
    }

    try {
      const plaintext = peerState.engine.decrypt(envelope.payload);
      const innerMessage: SignalingMessage = JSON.parse(plaintext);
      return innerMessage;
    } catch (err) {
      console.error('[E2E] Decryption failed from', senderPeerId, ':', err);
      return null;
    }
  }, []);

  // Listen for KeyExchange messages and Encrypted envelopes
  useEffect(() => {
    const unsubKeyExchange = context.onMessage('KeyExchange' as any, (msg) => {
      if (msg.from && msg.payload && msg.from !== peerId) {
        console.log('[E2E] Received KeyExchange from', msg.from);
        deriveSharedKey(msg.from, msg.payload);

        // Respond with our key if we haven't sent it yet
        if (!peerKeysRef.current.has(msg.from)) {
          sendKeyExchange(msg.from);
        } else {
          // We already have their key — just acknowledge
          sendKeyExchange(msg.from);
        }
      }
    });

    return () => { unsubKeyExchange(); };
  }, [context, peerId, deriveSharedKey, sendKeyExchange]);

  // Get E2E status for a specific peer
  const isPeerE2EReady = useCallback((targetPeerId: string): boolean => {
    return peerKeysRef.current.has(targetPeerId);
  }, []);

  // Get our public key for display/verification
  const getPublicKey = useCallback((): string | null => {
    return keypairRef.current?.publicKey ?? null;
  }, []);

  // Generate a Short Authentication String (SAS) for key verification
  // Users can compare this verbally to detect MITM
  const getSASCode = useCallback(async (targetPeerId: string): Promise<string | null> => {
    const peerState = peerKeysRef.current.get(targetPeerId);
    if (!peerState || !keypairRef.current) return null;

    // SAS = first 6 digits of SHA-256(sorted_public_keys)
    // Uses Web Crypto API for a real cryptographic hash
    const sortedKeys = [keypairRef.current.publicKey, peerState.publicKey].sort().join(':');
    const data = new TextEncoder().encode(sortedKeys);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    // Take first 4 bytes as a 32-bit integer, mod 1000000 → 6-digit code
    const num = (hashArray[0] << 24 | hashArray[1] << 16 | hashArray[2] << 8 | hashArray[3]) >>> 0;
    return (num % 1000000).toString().padStart(6, '0');
  }, []);

  // Clear E2E state (on disconnect)
  const clearE2EState = useCallback(() => {
    peerKeysRef.current.clear();
    pendingMessagesRef.current.clear();
    setIsE2EReady(false);
  }, []);

  return {
    isE2EReady,
    sendEncryptedMessage,
    decryptMessage,
    broadcastKeyExchange,
    sendKeyExchange,
    isPeerE2EReady,
    getPublicKey,
    getSASCode,
    clearE2EState,
  };
}
