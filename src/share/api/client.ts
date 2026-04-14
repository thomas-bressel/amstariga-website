/** Base URL of the Go API — nginx proxy on port 8090 in dev */
// const API_BASE = 'http://localhost:8090';

const API_BASE = 'http://amstariga-api-staging:8090';
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
