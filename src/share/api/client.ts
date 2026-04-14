/**
 * Base URL of the Go API.
 * - Server-side (SSR / Docker): `API_INTERNAL_URL` — internal Docker service name,
 *   fast and without TLS overhead (e.g. `http://amstariga-api-staging:8090`).
 * - Client-side (browser): `PUBLIC_API_URL` — public HTTPS endpoint; must be HTTPS
 *   to avoid mixed-content blocking, and must be reachable from the user's machine.
 *
 * Both values are injected via environment variables so the same build works
 * across dev, staging, and production without code changes.
 */
const API_BASE = typeof window === 'undefined'
    ? import.meta.env.API_INTERNAL_URL   // SSR — internal Docker network
    : import.meta.env.PUBLIC_API_URL;    // Browser — public HTTPS endpoint
/**
 * Performs a GET request to the Go API and returns the parsed JSON.
 *
 * @param path    - The path with the query string already built (e.g. `/api/games?limit=50`).
 * @returns         Parsed JSON body cast to `T`.
 * @throws {Error}  If the HTTP response status is not 2xx.
 */
export async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(API_BASE + path);
    console.log('[API FETCH] [MODEL] - ', path, '-', res.status);
    if (!res.ok) throw new Error(`API ${res.status} — ${path}`);
    return res.json();
}
