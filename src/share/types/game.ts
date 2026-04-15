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

export interface GameAuthor {
    name: string;
    role: string;
}

export interface GameDump {
    category:        string;
    file_name:       string;
    file_crc?:       string;
    loading_command?: string;
    status?:         string;
    comment?:        string;
    protection?:     string;
}

export interface GameComment {
    author?:  string;
    content?: string;
}

/** Full game detail as returned by GET /api/games/:id. */
export interface Game extends GameListItem {
    alt_title?:    string;
    editor?:       string;
    players_min?:  number;
    players_max?:  number;
    rating?:       number;
    synopsis?:     string;
    notes?:        string;
    is_adult?:     boolean;
    cpc_power_id?: number;
    categories?:   string[];
    authors?:      GameAuthor[];
    dumps?:        GameDump[];
    tips?:         string[];
    bugs?:         string[];
    comments?:     GameComment[];
    screenshots?:  string[];
}
