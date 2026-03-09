import { useState, useEffect, useRef } from 'react';

let wasmPromise: Promise<any> | null = null;
let wasmModule: any = null;

async function loadWasm(): Promise<any> {
    if (wasmModule) return wasmModule;

    const mod = await import('@buzzu/wasm/pkg/buzzu_wasm.js');
    await mod.default();
    wasmModule = mod;
    return mod;
}

export function useWasm() {
    const [wasm, setWasm] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!wasmPromise) {
            wasmPromise = loadWasm();
        }

        wasmPromise
            .then((mod) => {
                setWasm(mod);
                setIsLoading(false);
            })
            .catch((err) => {
                // Reset the cached promise so future mounts/retries
                // can attempt loading again (network blip recovery).
                wasmPromise = null;
                setError(err instanceof Error ? err : new Error(String(err)));
                setIsLoading(false);
            });
    }, []);

    return { wasm, isLoading, error };
}
