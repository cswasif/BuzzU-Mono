/**
 * Performs a "hard delete" of all local application data.
 * This includes clearing local storage, session storage, indexedDB,
 * caches, and unregistering all service workers.
 *
 * @returns {Promise<void>}
 */
export async function deepCleanAccountData(): Promise<void> {
    // 1. Clear Storage
    if (typeof window !== 'undefined') {
        window.localStorage.clear();
        window.sessionStorage.clear();
    }

    // 2. Clear Caches
    if ('caches' in window) {
        try {
            const cacheKeys = await window.caches.keys();
            await Promise.allSettled(cacheKeys.map((key) => window.caches.delete(key)));
        } catch (err) {
            console.error('Failed to clear caches:', err);
        }
    }

    // 3. Unregister Service Workers
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.allSettled(registrations.map((registration) => registration.unregister()));
        } catch (err) {
            console.error('Failed to unregister service workers:', err);
        }
    }

    // 4. Delete IndexedDB Databases
    const indexedDbAny = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };

    // Attempt to delete common/known databases first for safety (e.g. for engines using standardized names)
    const knownDbs = ['session-store', 'y-indexeddb', 'matching-db'];

    if (indexedDbAny && typeof indexedDbAny.databases === 'function') {
        try {
            const databases = await indexedDbAny.databases();
            await Promise.allSettled(
                databases
                    .map((db) => db.name)
                    .filter((name): name is string => Boolean(name))
                    .map((name) => new Promise<void>((resolve) => {
                        const request = indexedDB.deleteDatabase(name!);
                        request.onsuccess = () => resolve();
                        request.onerror = () => resolve();
                        request.onblocked = () => resolve();
                    }))
            );
        } catch (err) {
            console.error('Failed to clear IndexedDB via databases():', err);
        }
    } else {
        // Fallback for browsers (like Firefox) that don't support indexedDB.databases()
        // We delete known/common databases used in the app
        await Promise.allSettled(knownDbs.map(name => new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        })));
    }

    // 5. Clear Cookies
    if (typeof document !== 'undefined') {
        try {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf('=');
                const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;';
                // Also try common variants for domain/path safety
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname + ';';
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + window.location.hostname + ';';
            }
        } catch (err) {
            console.error('Failed to clear cookies:', err);
        }
    }

    // 6. Hard Reload to ensure all state is reset across tabs/workers
    if (typeof window !== 'undefined') {
        window.location.href = '/';
    }
}
