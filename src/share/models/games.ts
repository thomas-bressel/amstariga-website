import { apiFetch } from '../api/client';
import type { Game, GameFilters, GameListItem } from '../types/game';

/**
 * Builds a query string from filters and extra pagination params.
 *
 * @param filters - Active filters (search, categories, years).
 * @param extra   - Additional key/value pairs to prepend (e.g. limit, offset).
 * @returns       - URL-encoded query string without the leading '?'.
 */
function buildQS(filters: GameFilters, extra: Record<string, string | number> = {}): string {
    const params = new URLSearchParams();

    for (const [k, v] of Object.entries(extra)) {
        params.append(k, String(v));
    }

    if (filters.search) params.set('search', filters.search);

    for (const c of filters.parent_categories ?? []) {
        params.append('parent_categories', c);
    }

    for (const c of filters.child_categories ?? []) {
        params.append('child_categories', c);
    }

    for (const y of filters.years ?? []) {
        params.append('years', String(y));
    }

    if (filters.is_adult !== undefined) {
        params.set('is_adult', String(filters.is_adult));
    }

    return params.toString();
}

/**
 * Fetches a paginated list of games.
 *
 * @param filters - Active filters (search, categories, years).
 * @param limit   - Number of results per page (default 50).
 * @param offset  - Number of results to skip (default 0).
 * @returns       - Array of lightweight game objects.
 */
export function fetchGames( filters: GameFilters = {}, limit = 50, offset = 0): Promise<GameListItem[]> {
    const qs = buildQS(filters, { limit, offset });
    return apiFetch<GameListItem[]>(`/api/games?${qs}`);
}

/**
 * Fetches the total number of games matching the current filters.
 *
 * @param filters - Active filters (search, categories, years).
 * @returns       - Total count of matching games.
 */
export async function fetchGamesCount(filters: GameFilters = {}): Promise<number> {
    const qs = buildQS(filters);
    const data = await apiFetch<{ count: number }>(`/api/games/count${qs ? `?${qs}` : ''}`);
    return data.count;
}

/**
 * Fetches the offset of the first game whose title starts with a given letter.
 * Used for alphabetical navigation (A–Z or #).
 *
 * @param letter  - A single letter A-Z or '#' for non-alphabetical titles.
 * @returns       - Index (0-based) of the first matching game in the full sorted list.
 */
export async function fetchSeekOffset(letter: string): Promise<number> {
    const data = await apiFetch<{ offset: number }>(`/api/games/seek?letter=${encodeURIComponent(letter)}`);
    return data.offset;
}

/**
 * Fetches the full detail of a single game.
 *
 * @param id      - The game's numeric ID.
 * @returns       - Full game object including description, categories and screenshots.
 */
export function fetchGame(id: number): Promise<Game> {
    return apiFetch<Game>(`/api/games/${id}`);
}

export function fetchAvailableYears(filters: GameFilters = {}): Promise<number[]> {
    const qs = buildQS(filters);
    return apiFetch<number[]>(`/api/games/years${qs ? `?${qs}` : ''}`);
}

export function fetchSuggestions(prefix: string, filters: GameFilters = {}): Promise<string[]> {
    const qs = buildQS(filters, { q: prefix });
    return apiFetch<string[]>(`/api/games/suggest?${qs}`);
}
