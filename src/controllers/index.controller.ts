import { fetchGames, fetchGamesCount } from '../share/models/games';
import type { GameFilters, GameListItem } from '../share/types/game';

export interface IndexPageData {
    games: GameListItem[];
    total: number;
    filters: GameFilters;
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
    };

    const [games, total] = await Promise.all([
        fetchGames(filters, 50, 0),
        fetchGamesCount(filters),
    ]);

    return { games, total, filters };
}
