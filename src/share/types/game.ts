/** Filters passed to all game queries. */
export interface GameFilters {
    /** Free-text search on the game title. */
    search?: string;
    /** Catégories parentes (JEU, DEMO, COMPILATION…) — filtre OR. */
    parent_categories?: string[];
    /** Catégories enfants (Action, Shoot'Em Up…) — filtre OR, AND avec parent_categories. */
    child_categories?: string[];
    /** Langues (iso_code : eng, fra…) — filtre OR. */
    languages?: string[];
    /** List of release years to include (OR logic). */
    years?: number[];
    /** Filter by adult content: true = only adult, false = exclude adult, undefined = all. */
    is_adult?: boolean;
}

/** A single game as returned by GET /api/games. */
export interface GameListItem {
    /** Unique numeric identifier. */
    id: number;
    /** Primary title of the game. */
    main_title: string;
    /** Year the game was released. */
    release_year: number;
    /** Parent category (e.g. "JEU", "COMPILATION"). */
    category_parent?: string;
    /** Child category (e.g. "Action", "Plates-Formes"). */
    category_child?: string;
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

export interface Language {
    iso_code: string;
    name:     string;
}

export interface CompilationGame {
    order: number;
    id:    number;
    title: string;
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
    screenshots?:       string[];
    compilation_games?: CompilationGame[];
}
