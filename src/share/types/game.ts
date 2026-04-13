/** Filters passed to all game queries. */
export interface GameFilters {
    search?: string;
    categories?: string[];
    years?: number[];
}

/** A single game as returned by GET /api/games. */
export interface GameListItem {
    id: number;
    main_title: string;
    release_year: number;
}

/** Full game detail as returned by GET /api/games/:id. */
export interface Game extends GameListItem {
    description: string;
    categories: string[];
    screenshots: string[];
}
