/** Filters passed to all game queries. */
export interface GameFilters {
    search?: string;
    categories?: string[];
    years?: number[];
}

/** A single game as returned by GET /api/games. */
export interface GameListItem {
    id: number;
    title: string;
    platform: string;
    year: number;
    cover_url: string;
}

/** Full game detail as returned by GET /api/games/:id. */
export interface Game extends GameListItem {
    description: string;
    categories: string[];
    screenshots: string[];
}
