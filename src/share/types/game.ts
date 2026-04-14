/** Filters passed to all game queries. */
export interface GameFilters {
    /** Free-text search on the game title. */
    search?: string;
    /** List of category names to include (OR logic). */
    categories?: string[];
    /** List of release years to include (OR logic). */
    years?: number[];
}

/** A single game as returned by GET /api/games. */
export interface GameListItem {
    /** Unique numeric identifier. */
    id: number;
    /** Primary title of the game. */
    main_title: string;
    /** Year the game was released. */
    release_year: number;
}

/** Full game detail as returned by GET /api/games/:id. */
export interface Game extends GameListItem {
    /** Long-form description of the game. */
    description: string;
    /** Genre / category tags. */
    categories: string[];
    /** URLs or paths to in-game screenshots. */
    screenshots: string[];
}
