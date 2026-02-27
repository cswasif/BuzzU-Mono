/**
 * verifyGoogleToken.ts
 *
 * Client-side cryptographic verification of Google OAuth2 id_tokens.
 * Uses the Web Crypto API (SubtleCrypto) to verify RSA-SHA256 signatures
 * against Google's public JWKS — no libraries, no servers.
 *
 * This is the P2P verification module referenced in the BuzzU spec:
 *   "Verification tokens are shared peer-to-peer and verified using
 *    Google's public keys; no emails, hashes, or user data are stored
 *    on any server."
 */

// Google's JWKS endpoint
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

// Valid issuers for Google id_tokens
const VALID_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Cache for fetched JWKS keys (avoids re-fetching on every verification)
let cachedKeys: JsonWebKey[] | null = null;
let cacheExpiry = 0;

interface GoogleJwk {
    kty: string;
    alg: string;
    use: string;
    kid: string;
    n: string;
    e: string;
}

interface JwksResponse {
    keys: GoogleJwk[];
}

export interface VerifiedIdentity {
    email: string;
    domain: string;
    name?: string;
    picture?: string;
    emailVerified: boolean;
    issuedAt: number;
    expiresAt: number;
}

/** Base64URL decode (RFC 7515) */
function base64UrlDecode(str: string): Uint8Array {
    // Pad with '=' to make it valid base64
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (padded.length % 4)) % 4);
    const binary = atob(padded + padding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Parse a JWT into its three parts without verification */
function parseJwt(token: string): { header: any; payload: any; signatureBytes: Uint8Array; signedContent: string } {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid JWT: expected 3 parts');
    }

    const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));

    return {
        header: JSON.parse(headerJson),
        payload: JSON.parse(payloadJson),
        signatureBytes: base64UrlDecode(parts[2]),
        signedContent: `${parts[0]}.${parts[1]}`, // This is what's signed
    };
}

/** Fetch Google's public JWKS (with caching) */
async function fetchGoogleKeys(): Promise<GoogleJwk[]> {
    const now = Date.now();

    if (cachedKeys && now < cacheExpiry) {
        return cachedKeys as unknown as GoogleJwk[];
    }

    const response = await fetch(GOOGLE_JWKS_URI);
    if (!response.ok) {
        throw new Error(`Failed to fetch Google JWKS: ${response.status}`);
    }

    // Parse cache-control header for expiry
    const cacheControl = response.headers.get('cache-control');
    let maxAge = 3600; // Default 1 hour
    if (cacheControl) {
        const match = cacheControl.match(/max-age=(\d+)/);
        if (match) {
            maxAge = parseInt(match[1], 10);
        }
    }

    const jwks: JwksResponse = await response.json();
    cachedKeys = jwks.keys as unknown as JsonWebKey[];
    cacheExpiry = now + maxAge * 1000;

    return jwks.keys;
}

/** Import a JWK into a CryptoKey for RSA signature verification */
async function importKey(jwk: GoogleJwk): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'jwk',
        {
            kty: jwk.kty,
            n: jwk.n,
            e: jwk.e,
            alg: 'RS256',
            ext: true,
        },
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: { name: 'SHA-256' },
        },
        false, // not extractable
        ['verify']
    );
}

/**
 * Cryptographically verify a Google id_token.
 *
 * This performs ALL of the following checks:
 * 1. Fetches Google's public JWKS and finds the matching key by `kid`
 * 2. Verifies the RSA-SHA256 signature using Web Crypto API
 * 3. Validates the `iss` (issuer) claim
 * 4. Validates the `aud` (audience) claim against our client ID
 * 5. Validates the `exp` (expiration) claim
 * 6. Validates the `hd` (hosted domain) claim for BracU
 * 7. Ensures `email_verified` is true
 *
 * @param token - The raw JWT id_token string
 * @param expectedClientId - The Google OAuth client ID to validate against
 * @returns VerifiedIdentity if all checks pass
 * @throws Error with descriptive message if any check fails
 */
export async function verifyGoogleIdToken(
    token: string,
    expectedClientId: string
): Promise<VerifiedIdentity> {
    // Step 1: Parse the JWT
    const { header, payload, signatureBytes, signedContent } = parseJwt(token);

    // Step 2: Verify algorithm is RS256
    if (header.alg !== 'RS256') {
        throw new Error(`Unsupported algorithm: ${header.alg}. Expected RS256.`);
    }

    // Step 3: Fetch Google's public keys and find the matching one
    const keys = await fetchGoogleKeys();
    const matchingKey = keys.find((k) => k.kid === header.kid);
    if (!matchingKey) {
        throw new Error(`No matching Google public key found for kid: ${header.kid}`);
    }

    // Step 4: CRYPTOGRAPHIC SIGNATURE VERIFICATION
    // This is the critical step — we use the Web Crypto API to verify
    // that Google actually signed this token with their private key
    const cryptoKey = await importKey(matchingKey);
    const signedData = new TextEncoder().encode(signedContent);
    const isSignatureValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signatureBytes.buffer as ArrayBuffer,
        signedData
    );

    if (!isSignatureValid) {
        throw new Error('SIGNATURE VERIFICATION FAILED: Token was not signed by Google.');
    }

    // Step 5: Validate issuer
    if (!VALID_ISSUERS.includes(payload.iss)) {
        throw new Error(`Invalid issuer: ${payload.iss}`);
    }

    // Step 6: Validate audience (must be OUR client ID)
    if (payload.aud !== expectedClientId) {
        throw new Error(`Invalid audience: ${payload.aud}. Expected: ${expectedClientId}`);
    }

    // Step 7: Validate expiration (with 5 minute clock skew tolerance)
    const now = Math.floor(Date.now() / 1000);
    const CLOCK_SKEW_SECS = 300; // 5 minutes

    if (payload.exp < now - CLOCK_SKEW_SECS) {
        throw new Error(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
    }

    // Step 8: Validate hosted domain — MUST be BracU
    if (payload.hd !== 'g.bracu.ac.bd') {
        throw new Error(`Invalid domain: ${payload.hd}. Expected: g.bracu.ac.bd`);
    }

    // Step 9: Ensure email is verified by Google
    if (!payload.email_verified) {
        throw new Error('Email is not verified by Google.');
    }

    // All checks passed — return the verified identity
    return {
        email: payload.email,
        domain: payload.hd,
        name: payload.name,
        picture: payload.picture,
        emailVerified: payload.email_verified,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}

/**
 * Quick check: is this token STRUCTURALLY valid and not expired?
 * Does NOT verify the signature — use verifyGoogleIdToken() for that.
 */
export function isTokenStructurallyValid(token: string): boolean {
    try {
        const { payload } = parseJwt(token);
        const now = Math.floor(Date.now() / 1000);
        return (
            payload.hd === 'g.bracu.ac.bd' &&
            payload.exp > now - 300 &&
            payload.email_verified === true
        );
    } catch {
        return false;
    }
}
