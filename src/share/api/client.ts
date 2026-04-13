/** Base URL of the Go API — nginx proxy on port 8090 in dev */
const API_BASE = 'http://localhost:8090';

/**
 * Performs a GET request to the Go API and returns the parsed JSON.
 *
 * @param path - The path with the query string already built.
 * @throws Error if the HTTP response is not ok (4xx, 5xx)
 */
export async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`API ${res.status} — ${path}`);
    return res.json();
}
