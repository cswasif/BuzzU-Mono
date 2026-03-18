import { useCallback, useRef, useState, useEffect } from 'react';
import { useWasm } from './useWasm';
import { fingerprintBytes, fingerprintValue, parseJsonSafe, traceE2E } from "../utils/e2eTrace";

const SESSION_KEY_STORAGE_KEY = 'buzzu_session_key';

export function useCrypto() {
    const { wasm } = useWasm();
    const engineRef = useRef<any>(null);
    const signalProtocolRef = useRef<any>(null);
    // Signal sessions are WASM handles — they CANNOT be serialized to JSON/localStorage.
    // Sessions are ephemeral: a fresh key exchange happens on every match/reconnect.
    const signalSessionsRef = useRef<Record<string, any>>({});
    // State for triggering re-renders when sessions change
    const [signalSessionVersion, setSignalSessionVersion] = useState(0);
    const [sessionKey, setSessionKey] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem(SESSION_KEY_STORAGE_KEY);
        }
        return null;
    });

    const describeSessionState = useCallback((peerId?: string) => {
        const peerCount = Object.keys(signalSessionsRef.current).length;
        return {
            targetPeerId: peerId ?? null,
            hasTargetSession: peerId ? !!signalSessionsRef.current[peerId] : null,
            activeSessionPeers: peerCount,
            signalSessionVersion,
            wasmReady: !!wasm,
        };
    }, [signalSessionVersion, wasm]);

    useEffect(() => {
        if (typeof window !== 'undefined' && sessionKey) {
            localStorage.setItem(SESSION_KEY_STORAGE_KEY, sessionKey);
        }
    }, [sessionKey]);

    const getEngine = useCallback(() => {
        if (!wasm) throw new Error('WASM not loaded');
        if (!engineRef.current) {
            // Generate a real random AES-256 key for legacy CryptoEngine
            // This key is per-session and NOT suitable for E2E (use Signal sessions for that)
            const randomKey = wasm.CryptoEngine.generate_key();
            engineRef.current = new wasm.CryptoEngine(randomKey);
        }
        return engineRef.current;
    }, [wasm]);

    const getSignalProtocol = useCallback(() => {
        console.log('[useCrypto] [Signal Debug] Getting SignalProtocol, wasm:', !!wasm, 'signalProtocolRef.current:', !!signalProtocolRef.current);
        if (!wasm) throw new Error('WASM not loaded');
        if (!signalProtocolRef.current) {
            console.log('[useCrypto] [Signal Debug] Creating new SignalProtocol instance');
            signalProtocolRef.current = new wasm.SignalProtocol();
            traceE2E("crypto.signal_protocol.init", {
                ...describeSessionState(),
                protocolHandleCreated: true,
            }, "debug");
        }
        return signalProtocolRef.current;
    }, [describeSessionState, wasm]);

    // Helper to recursively convert Map to Object - robust for cross-context Maps
    const mapToObject = (input: any): any => {
        if (!input) return input;

        // Duck typing for Map since instanceof can fail across WASM/iframe boundaries
        if (input instanceof Map || (typeof input.entries === 'function' && typeof input.has === 'function')) {
            const obj: any = {};
            for (const [key, value] of input.entries()) {
                obj[key] = mapToObject(value);
            }
            return obj;
        } else if (Array.isArray(input)) {
            return input.map(mapToObject);
        } else if (typeof input === 'object') {
            const obj: any = {};
            for (const key in input) {
                if (Object.prototype.hasOwnProperty.call(input, key)) {
                    obj[key] = mapToObject(input[key]);
                }
            }
            return obj;
        }
        return input;
    };

    const generatePreKeyBundle = useCallback(() => {
        console.log('[useCrypto] [Signal Debug] Generating pre-key bundle...');
        const protocol = getSignalProtocol();
        const bundleRaw = protocol.generate_bundle();
        console.log('[useCrypto] [Signal Debug] Pre-key bundle generated, type:', typeof bundleRaw);

        let bundle = bundleRaw;
        // Convert WASM Map/Object to plain object if needed
        if (bundleRaw instanceof Map || (typeof bundleRaw === 'object' && bundleRaw !== null)) {
            bundle = mapToObject(bundleRaw);
            console.log('[useCrypto] [Signal Debug] Converted bundle to object');
        }

        // Ensure the final returned value is a string for the signaling server
        if (typeof bundle !== 'string') {
            bundle = JSON.stringify(bundle);
        }

        const parsed = parseJsonSafe<Record<string, string | null>>(bundle);
        traceE2E("crypto.prekey_bundle.generated", {
            ...describeSessionState(),
            bundleLength: bundle.length,
            identityKeyFp: fingerprintValue(parsed?.identity_key ?? null),
            signedPreKeyFp: fingerprintValue(parsed?.signed_prekey ?? null),
            ratchetKeyFp: fingerprintValue(parsed?.ratchet_key ?? null),
            signatureFp: fingerprintValue(parsed?.signed_prekey_signature ?? null),
            certificateValidationResult: "local_signed_prekey_bundle_created",
        }, "info");

        return bundle;
    }, [describeSessionState, getSignalProtocol]);

    const initiateSignalSession = useCallback((peerId: string, bundleStr: string) => {
        console.log('[useCrypto] [Signal Debug] Initiating Signal session for peerId:', peerId, 'bundle length:', bundleStr?.length);
        const protocol = getSignalProtocol();

        // Ensure bundleStr is a string if it somehow got passed as an object
        const bundlePayload = typeof bundleStr === 'string' ? bundleStr : JSON.stringify(bundleStr);

        // NEW API: initiate_session() returns a proper SignalSession WASM handle.
        // The handshake initiation data is stored on the protocol object.
        const parsedBundle = parseJsonSafe<Record<string, string | null>>(bundlePayload);
        traceE2E("crypto.session.initiate.start", {
            ...describeSessionState(peerId),
            bundleLength: bundlePayload.length,
            remoteIdentityKeyFp: fingerprintValue(parsedBundle?.identity_key ?? null),
            remoteSignedPreKeyFp: fingerprintValue(parsedBundle?.signed_prekey ?? null),
            remoteRatchetKeyFp: fingerprintValue(parsedBundle?.ratchet_key ?? null),
            remoteSignatureFp: fingerprintValue(parsedBundle?.signed_prekey_signature ?? null),
            certificateValidationExpected: "signed_prekey_signature_verify",
        }, "info");

        let session: any;
        try {
            session = protocol.initiate_session(bundlePayload);
        } catch (error) {
            traceE2E("crypto.session.initiate.failed", {
                ...describeSessionState(peerId),
                bundleLength: bundlePayload.length,
                certificateValidationResult: "failed",
                error: error instanceof Error ? error.message : String(error),
            }, "error");
            throw error;
        }
        console.log('[useCrypto] [Signal Debug] Session initiated, session type:', typeof session, 'has encrypt:', typeof session?.encrypt);

        // Retrieve the handshake data to send to the peer
        const initiationJson = protocol.get_last_initiation();
        if (!initiationJson) {
            throw new Error('initiate_session succeeded but no initiation data available');
        }

        console.log('[useCrypto] [Signal Debug] Initiation JSON length:', initiationJson.length);

        // Store the WASM session handle directly — do NOT serialize to JSON
        signalSessionsRef.current = { ...signalSessionsRef.current, [peerId]: session };
        setSignalSessionVersion(v => v + 1);
        console.log('[useCrypto] [Signal Debug] Session stored for peerId:', peerId);
        const parsedInitiation = parseJsonSafe<Record<string, string | null>>(initiationJson);
        traceE2E("crypto.session.initiate.success", {
            ...describeSessionState(peerId),
            initiationLength: initiationJson.length,
            certificateValidationResult: "verified",
            localIdentityKeyFp: fingerprintValue(parsedInitiation?.identity_key ?? null),
            localEphemeralKeyFp: fingerprintValue(parsedInitiation?.ephemeral_key ?? null),
            localRatchetKeyFp: fingerprintValue(parsedInitiation?.ratchet_key ?? null),
            hasEncryptMethod: typeof session?.encrypt === "function",
        }, "info");

        return initiationJson; // Alice sends this to Bob (stringified SessionInitiation)
    }, [describeSessionState, getSignalProtocol]);

    const respondToSignalSession = useCallback((peerId: string, initiationStr: string) => {
        console.log('[useCrypto] [Signal Debug] Responding to Signal session for peerId:', peerId, 'initiation length:', initiationStr?.length);
        const protocol = getSignalProtocol();

        const initiationPayload = typeof initiationStr === 'string' ? initiationStr : JSON.stringify(initiationStr);
        const parsedInitiation = parseJsonSafe<Record<string, string | null>>(initiationPayload);
        traceE2E("crypto.session.respond.start", {
            ...describeSessionState(peerId),
            initiationLength: initiationPayload.length,
            remoteIdentityKeyFp: fingerprintValue(parsedInitiation?.identity_key ?? null),
            remoteEphemeralKeyFp: fingerprintValue(parsedInitiation?.ephemeral_key ?? null),
            remoteRatchetKeyFp: fingerprintValue(parsedInitiation?.ratchet_key ?? null),
            certificateValidationExpected: "session_initiation_structure_and_keys",
        }, "info");
        let session: any;
        try {
            session = protocol.respond_to_session(initiationPayload);
        } catch (error) {
            traceE2E("crypto.session.respond.failed", {
                ...describeSessionState(peerId),
                initiationLength: initiationPayload.length,
                certificateValidationResult: "failed",
                error: error instanceof Error ? error.message : String(error),
            }, "error");
            throw error;
        }

        console.log('[useCrypto] [Signal Debug] Session responded, session type:', typeof session, 'has encrypt:', typeof session?.encrypt);

        // Store the WASM session handle directly — do NOT serialize to JSON
        signalSessionsRef.current = { ...signalSessionsRef.current, [peerId]: session };
        setSignalSessionVersion(v => v + 1);
        console.log('[useCrypto] [Signal Debug] Session stored for peerId:', peerId);
        traceE2E("crypto.session.respond.success", {
            ...describeSessionState(peerId),
            certificateValidationResult: "verified",
            hasEncryptMethod: typeof session?.encrypt === "function",
        }, "info");
        return session;
    }, [describeSessionState, getSignalProtocol]);

    const normalizeBytes = useCallback((input: any): Uint8Array => {
        if (input instanceof Uint8Array) return input;
        if (input instanceof ArrayBuffer) return new Uint8Array(input);
        if (Array.isArray(input)) return Uint8Array.from(input);
        if (input && typeof input === 'object') {
            if (input.buffer instanceof ArrayBuffer) {
                return new Uint8Array(input.buffer, input.byteOffset ?? 0, input.byteLength ?? undefined);
            }
            if (Array.isArray((input as any).data)) {
                return Uint8Array.from((input as any).data);
            }
        }
        throw new Error('Unsupported ciphertext format');
    }, []);

    const encryptMessage = useCallback((peerId: string, plaintext: string) => {
        const session = signalSessionsRef.current[peerId];
        if (!session) throw new Error(`No Signal session for ${peerId}`);
        const data = new TextEncoder().encode(plaintext);
        traceE2E("crypto.message.encrypt.start", {
            ...describeSessionState(peerId),
            plaintextLength: data.byteLength,
        }, "debug");
        try {
            const raw = session.encrypt(data);
            const bytes = normalizeBytes(raw);
            traceE2E("crypto.message.encrypt.success", {
                ...describeSessionState(peerId),
                plaintextLength: data.byteLength,
                ciphertextLength: bytes.byteLength,
                ciphertextFp: fingerprintBytes(bytes),
            }, "debug");
            return bytes;
        } catch (error) {
            traceE2E("crypto.message.encrypt.failed", {
                ...describeSessionState(peerId),
                plaintextLength: data.byteLength,
                error: error instanceof Error ? error.message : String(error),
            }, "error");
            throw error;
        }
    }, [describeSessionState, normalizeBytes]);

    const decryptMessage = useCallback((peerId: string, ciphertext: Uint8Array) => {
        const session = signalSessionsRef.current[peerId];
        if (!session) throw new Error(`No Signal session for ${peerId}`);
        const payload = normalizeBytes(ciphertext);
        traceE2E("crypto.message.decrypt.start", {
            ...describeSessionState(peerId),
            ciphertextLength: payload.byteLength,
            ciphertextFp: fingerprintBytes(payload),
        }, "debug");
        try {
            const decrypted = session.decrypt(payload);
            const decryptedBytes = normalizeBytes(decrypted);
            traceE2E("crypto.message.decrypt.success", {
                ...describeSessionState(peerId),
                ciphertextLength: payload.byteLength,
                plaintextLength: decryptedBytes.byteLength,
            }, "debug");
            return decryptedBytes;
        } catch (error) {
            traceE2E("crypto.message.decrypt.failed", {
                ...describeSessionState(peerId),
                ciphertextLength: payload.byteLength,
                ciphertextFp: fingerprintBytes(payload),
                error: error instanceof Error ? error.message : String(error),
            }, "error");
            throw error;
        }
    }, [describeSessionState, normalizeBytes]);

    const hasSignalSession = useCallback((peerId: string) => {
        return !!signalSessionsRef.current[peerId];
    }, []);

    const generateSessionKey = useCallback((): string => {
        const key = wasm.CryptoEngine.generate_key();
        setSessionKey(key);
        return key;
    }, [wasm]);

    const encrypt = useCallback((plaintext: string, key?: string): { ciphertext: string; nonce: string } => {
        const protocol = getSignalProtocol(); // Ensure WASM is ready
        const engine = getEngine();
        const useKey = key || sessionKey;
        if (!useKey) throw new Error('No encryption key');

        const nonce = wasm.CryptoEngine.generate_nonce();
        const ciphertext = engine.encrypt(plaintext, nonce);

        return { ciphertext, nonce };
    }, [getEngine, getSignalProtocol, sessionKey, wasm]);

    const decrypt = useCallback((ciphertext: string, nonce: string, key?: string): string => {
        const engine = getEngine();
        const useKey = key || sessionKey;
        if (!useKey) throw new Error('No decryption key');

        return engine.decrypt(ciphertext, nonce);
    }, [getEngine, sessionKey]);

    const clearSignalSessions = useCallback(() => {
        traceE2E("crypto.session.clear_all", {
            ...describeSessionState(),
        }, "info");
        signalSessionsRef.current = {};
        setSignalSessionVersion(v => v + 1);
        // Also clear any stale localStorage data from old versions
        if (typeof window !== 'undefined') {
            localStorage.removeItem('buzzu_signal_sessions');
        }
    }, [describeSessionState]);

    const clearSignalSession = useCallback((peerId: string) => {
        if (!signalSessionsRef.current[peerId]) return;
        traceE2E("crypto.session.clear_one", {
            ...describeSessionState(peerId),
        }, "info");
        const next = { ...signalSessionsRef.current };
        delete next[peerId];
        signalSessionsRef.current = next;
        setSignalSessionVersion(v => v + 1);
    }, [describeSessionState]);

    const clearSessionKey = useCallback(() => {
        setSessionKey(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(SESSION_KEY_STORAGE_KEY);
        }
    }, []);

    const clearAllCryptoData = useCallback(() => {
        clearSignalSessions();
        clearSessionKey();
    }, [clearSignalSessions, clearSessionKey]);

    return {
        isReady: !!wasm,
        signalSessionVersion,
        sessionKey,
        generateSessionKey,
        encrypt,
        decrypt,
        generatePreKeyBundle,
        initiateSignalSession,
        respondToSignalSession,
        encryptMessage,
        decryptMessage,
        hasSignalSession,
        clearSignalSessions,
        clearSignalSession,
        clearSessionKey,
        clearAllCryptoData,
    };
}
