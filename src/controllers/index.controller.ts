import { fetchGames, fetchGamesCount } from '../share/models/games';
import type { GameFilters, GameListItem, GameOrigin } from '../share/types/game';

/** Data shape returned by the index page controller and forwarded to the React island. */
export interface IndexPageData {
    /** First page of games (up to 50) matching the active filters. */
    games: GameListItem[];
    /** Total number of games matching the active filters. */
    total: number;
    /** Filters derived from the current URL search params. */
    filters: GameFilters;
}

/** ?origin=human | ai_assisted (casse indifférente) → valeur du filtre, undefined sinon. */
function parseOrigin(value: string | null): GameOrigin | undefined {
    switch (value?.toUpperCase()) {
        case 'HUMAN':       return 'HUMAN';
        case 'AI_ASSISTED': return 'AI_ASSISTED';
        default:            return undefined;
    }
}

/**
 * Reads the URL search params, fetches games and total count from the API.
 *
 * @param url - The current request URL (from Astro.url).
 * @returns   - Games, total count and active filters for the index page.
 */
export async function getIndexData(url: URL): Promise<IndexPageData> {
    const filters: GameFilters = {
        search:     url.searchParams.get('search') ?? '',
        categories: url.searchParams.getAll('categories'),
        years:      url.searchParams.getAll('years').map(Number).filter(Boolean),
        origin:     parseOrigin(url.searchParams.get('origin')),
    };

    const [games, total] = await Promise.all([
        fetchGames(filters, 50, 0),
        fetchGamesCount(filters),
    ]);

    return { games, total, filters };
}
