import { useCallback, useRef, useState } from 'react';
import { useWasm } from './useWasm';

export function useCrypto() {
    const { wasm } = useWasm();
    const engineRef = useRef<any>(null);
    const [sessionKey, setSessionKey] = useState<string | null>(null);

    const getEngine = useCallback(() => {
        if (!wasm) throw new Error('WASM not loaded');
        if (!engineRef.current) {
            engineRef.current = new wasm.CryptoEngine();
        }
        return engineRef.current;
    }, [wasm]);

    const generateSessionKey = useCallback((): string => {
        const engine = getEngine();
        const key = engine.generate_key();
        setSessionKey(key);
        return key;
    }, [getEngine]);

    const encrypt = useCallback((plaintext: string, key?: string): { ciphertext: Uint8Array; nonce: string } => {
        const engine = getEngine();
        const useKey = key || sessionKey;
        if (!useKey) throw new Error('No encryption key');

        const nonce = engine.generate_nonce();
        const data = new TextEncoder().encode(plaintext);
        const ciphertext = engine.encrypt(useKey, nonce, data);

        return { ciphertext, nonce };
    }, [getEngine, sessionKey]);

    const decrypt = useCallback((ciphertext: Uint8Array, nonce: string, key?: string): string => {
        const engine = getEngine();
        const useKey = key || sessionKey;
        if (!useKey) throw new Error('No decryption key');

        const plaintext = engine.decrypt(useKey, nonce, ciphertext);
        return new TextDecoder().decode(plaintext);
    }, [getEngine, sessionKey]);

    return {
        isReady: !!wasm,
        sessionKey,
        generateSessionKey,
        encrypt,
        decrypt,
    };
}
