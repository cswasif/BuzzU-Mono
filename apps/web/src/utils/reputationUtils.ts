/**
 * Utility for reputation-related operations.
 * Connects the frontend to the buzzu-reputation worker.
 */

const REPUTATION_URL = process.env.REPUTATION_URL || import.meta.env.VITE_REPUTATION_URL || 'https://buzzu-reputation.cswasif.workers.dev';

/**
 * Hash a peer ID using SHA-256 for privacy-preserving storage in the reputation worker.
 * Matches the hashing logic in the reputation-worker backend.
 */
export async function hashPeerId(peerId: string): Promise<string> {
    if (!peerId) return '';
    const msgUint8 = new TextEncoder().encode(peerId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Submit a report against a user to the reputation worker.
 */
export async function reportUser(
    reporterId: string,
    targetId: string,
    reason: string,
    details: string = ''
): Promise<boolean> {
    if (!reporterId || !targetId) {
        console.error('[Reputation] Missing reporterId or targetId');
        return false;
    }

    try {
        const [reporter_hash, target_hash] = await Promise.all([
            hashPeerId(reporterId),
            hashPeerId(targetId)
        ]);

        const url = `${REPUTATION_URL}/reputation/report?target=${target_hash}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reporter_hash,
                target_hash,
                reason,
                details
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Reputation] Report submission failed:', errorText);
            return false;
        }

        console.log('[Reputation] Report submitted successfully for target:', target_hash);
        return true;
    } catch (err) {
        console.error('[Reputation] Error submitting report:', err);
        return false;
    }
}
