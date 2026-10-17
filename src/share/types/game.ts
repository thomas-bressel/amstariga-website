/** Origine d'un jeu : HUMAN (classique) ou AI_ASSISTED (réalisé avec l'aide d'une IA). */
export type GameOrigin = 'HUMAN' | 'AI_ASSISTED';

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
    /** Origine : jeux humains ou réalisés avec l'aide d'une IA ; undefined = tous. */
    origin?: GameOrigin;
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
    /** HUMAN ou AI_ASSISTED. */
    origin?: GameOrigin;
    /** Machine (slug) : amstrad, atari-st, amiga. */
    machine?: string;
    /** Nom de la machine (Amstrad CPC…). */
    machine_name?: string;
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
    /** Fichier présent sur le serveur : adresse de téléchargement (/uploads/…). */
    url?:            string;
    /** Taille du fichier présent sur le serveur, en octets. */
    size?:           number;
}

/** Fichier d'un jeu présent sur le serveur. */
export interface GameFile {
    name:    string;
    /** Adresse sur le site : /uploads/… */
    url:     string;
    size:    number;
    /** Dossier de la release (D7_UK_original…). */
    folder?: string;
}

/** Fichiers du dossier du jeu sur le serveur (absents si le jeu n'en a aucun). */
export interface GameFiles {
    thumbnail?: string;
    /** Scans de boîte, cartouche, étiquette… */
    scans?:     GameFile[];
    manuals?:   GameFile[];
    /** Fichiers des releases (.dsk, .cdt, .cpr…). */
    releases?:  GameFile[];
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
    files?:             GameFiles;
}
