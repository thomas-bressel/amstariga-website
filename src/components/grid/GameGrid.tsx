import { useEffect, useRef, useState } from 'react';
import { fetchGames, fetchGamesCount } from '../../share/models/games';
import type { GameFilters, GameListItem } from '../../share/types/game';
import Carousel from '../carousel/Carousel';
import './GameGrid.css';

/** Number of games fetched per infinite-scroll batch. */
const BATCH_SIZE = 50;

/**
 * Emoji icon for each game category, keyed by the exact category name stored
 * in the database. Only gameplay categories (mixed-case) are listed here —
 * meta-categories (JEU, DEMO, UTILITAIRE, COMPILATION…) are intentionally
 * excluded from the filter bar.
 */
const CAT_ICONS: Record<string, string> = {
    'Action':           '⚔️',
    'Aventure':         '🗺️',
    'Casse-Briques':    '🧱',
    'Combat':           '🥊',
    'Course':           '🏎️',
    'Jeu de Café':      '🕹️',
    'Jeu de Rôle':      '🐉',
    'Labyrinthe':       '🌀',
    'Plates-Formes':    '🏃',
    'Quiz':             '❓',
    'Réflexion':        '🧩',
    'Run & Gun':        '🔫',
    "Shoot'Em Up":      '🚀',
    'Simulation':       '✈️',
    'Sport':            '⚽',
    'Stratégie':        '♟️',
    'Tir sur Cibles':   '🎯',
    'default':          '🎮',
};

/** Release years available in the year filter (1982–1999). */
const YEARS: number[] = [];
for (let y = 1982; y <= 1999; y++) YEARS.push(y);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link GameGrid}. */
interface Props {
    /** Initial games loaded by SSR (first 50). */
    initialGames: GameListItem[];
    /** Total count matching no filters (from SSR). */
    initialTotal: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Main interactive game list with infinite scroll, category/year filters,
 * and a toggle between the 3-D carousel view and the flat grid view.
 *
 * State management:
 * - `games` / `offset` — accumulate batches as the user scrolls
 * - `filters` — shared by the chip bar, the active-filters strip, and the bottom sheet
 * - `view` — `'cover'` (carousel, default) or `'grid'`
 *
 * Cross-component communication (custom events on `window`):
 * - Dispatches `retro:count-update` when `total` changes → updates {@link TapeCounter}
 * - Listens to `retro:view-change` → switches between carousel and grid
 *
 * @param initialGames - First batch of games pre-rendered by SSR.
 * @param initialTotal - Total matching game count pre-rendered by SSR.
 */
export default function GameGrid({ initialGames, initialTotal }: Props) {
    const [games, setGames]         = useState<GameListItem[]>(initialGames);
    const [total, setTotal]         = useState(initialTotal);

    // Sync total to TapeCounter in header
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('retro:count-update', { detail: { count: total } }));
    }, [total]);
    const [offset, setOffset]       = useState(initialGames.length);
    const [hasMore, setHasMore]     = useState(initialGames.length === BATCH_SIZE);
    const [isLoading, setIsLoading] = useState(false);
    const [filters, setFilters]     = useState<GameFilters>({ categories: [], years: [] });
    const [sheetOpen, setSheetOpen] = useState(false);
    const [view, setView]           = useState<'grid' | 'cover'>('cover');

    useEffect(() => {
        document.body.style.overflowY = view === 'cover' ? 'hidden' : '';
        document.body.style.overflowX = '';
        return () => { document.body.style.overflowY = ''; };
    }, [view]);

    const sentinelRef = useRef<HTMLDivElement>(null);
    const filtersRef  = useRef<GameFilters>(filters);
    const offsetRef   = useRef(offset);

    // Keep refs in sync so the IntersectionObserver callback sees fresh values.
    filtersRef.current = filters;
    offsetRef.current  = offset;

    // On mount — if returning visitor, show chip bar immediately
    useEffect(() => {
        const chipbar = document.querySelector('.filter-chip-bar');
        if (!chipbar) return;
        if (localStorage.getItem('amstariga_visited')) {
            chipbar.classList.add('is-visible', 'no-transition');
        }
    }, []);

    // IntersectionObserver on the sentinel element at the bottom of the list
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: '200px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    // Listen to view-change events dispatched by the header view-toggle buttons
    useEffect(() => {
        const handler = (e: Event) => {
            const v = (e as CustomEvent<{ view: 'grid' | 'cover' }>).detail.view;
            setView(v);
        };
        window.addEventListener('retro:view-change', handler);
        return () => window.removeEventListener('retro:view-change', handler);
    }, []);

    /**
     * Fetches the next batch of games and appends them to the list.
     * No-ops when a request is already in flight or there are no more results.
     */
    async function loadMore() {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        try {
            const batch = await fetchGames(filtersRef.current, BATCH_SIZE, offsetRef.current) ?? [];
            if (!batch.length) {
                setHasMore(false);
                return;
            }
            setGames(prev => [...prev, ...batch]);
            setOffset(prev => prev + batch.length);
            setHasMore(batch.length === BATCH_SIZE);
        } finally {
            setIsLoading(false);
        }
    }

    /**
     * Replaces the current game list with a fresh fetch using the given filters.
     * Resets offset and `hasMore` so infinite scroll restarts from the beginning.
     *
     * @param next - The new filter state to apply.
     */
    async function applyFilters(next: GameFilters) {
        setFilters(next);
        setIsLoading(true);
        try {
            const [batch, count] = await Promise.all([
                fetchGames(next, BATCH_SIZE, 0),
                fetchGamesCount(next),
            ]);
            const safeBatch = batch ?? [];
            setGames(safeBatch);
            setTotal(count);
            setOffset(safeBatch.length);
            setHasMore(safeBatch.length === BATCH_SIZE);
        } finally {
            setIsLoading(false);
        }
    }

    /**
     * Toggles a category in the active filters.
     *
     * @param cat - Category name to add or remove.
     */
    function toggleCategory(cat: string) {
        const cats = filters.categories ?? [];
        const next = cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat];
        applyFilters({ ...filters, categories: next });
    }

    /**
     * Toggles a release year in the active filters.
     *
     * @param year - Year to add or remove.
     */
    function toggleYear(year: number) {
        const years = filters.years ?? [];
        const next  = years.includes(year) ? years.filter(y => y !== year) : [...years, year];
        applyFilters({ ...filters, years: next });
    }

    /** Clears all active filters and reloads the full game list. */
    function resetFilters() {
        applyFilters({ categories: [], years: [] });
    }

    /** Total number of active filter criteria (used for the badge counter). */
    const activeCount = (filters.categories?.length ?? 0) + (filters.years?.length ?? 0);

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    return (
        <div>
            {/* ── Chip bar ── */}
            <div className="filter-chip-bar">
                <button
                    className={`fchip fchip-all ${activeCount === 0 ? 'fchip-active' : ''}`}
                    onClick={resetFilters}
                >
                    ✦ TOUS
                </button>
                {Object.keys(CAT_ICONS).filter(k => k !== 'default').sort().map(cat => (
                    <button
                        key={cat}
                        className={`fchip ${filters.categories?.includes(cat) ? 'fchip-active' : ''}`}
                        onClick={() => toggleCategory(cat)}
                    >
                        {CAT_ICONS[cat]} {cat.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* ── Active filters strip ── */}
            {activeCount > 0 && (
                <div className="active-filters-strip has-tags">
                    {filters.categories?.map(cat => (
                        <span key={cat} className="atag" onClick={() => toggleCategory(cat)}>
                            {cat} <span className="atag-x">&times;</span>
                        </span>
                    ))}
                    {filters.years?.map(y => (
                        <span key={y} className="atag" onClick={() => toggleYear(y)}>
                            {y} <span className="atag-x">&times;</span>
                        </span>
                    ))}
                </div>
            )}

            <button
                className={`filter-fab ${activeCount > 0 ? 'has-active' : ''}`}
                onClick={() => setSheetOpen(true)}
                aria-label="Ouvrir les filtres avancés"
                style={{ zIndex: 900 }}
            >
                <span className="fab-ico">⚙</span>
                <span className="fab-lbl">FILTRES</span>
                {activeCount > 0 && <span className="fab-badge show">{activeCount}</span>}
            </button>

            {/* ── Carousel ou Grille ── */}
            {view === 'cover' ? (
                <Carousel games={games} />
            ) : (
                <div className="games-container">
                    {games.map(game => (
                        <a key={game.id} className="game-card screenshot-mode" href={`/game/${game.id}`}>
                            <div className="game-screenshot">
                                <div className="screenshot-placeholder pixel-effect">🎮</div>
                            </div>
                            <div className="game-info">
                                <div className="game-title">{game.main_title}</div>
                                <div className="game-year-publisher">{game.release_year}</div>
                            </div>
                        </a>
                    ))}
                </div>
            )}

            {isLoading && <div className="loader">Chargement...</div>}
            <div ref={sentinelRef} style={{ height: 20 }} />

            {/* ── Bottom sheet ── */}
            {sheetOpen && (
                <>
                    <div className="filter-overlay open" onClick={() => setSheetOpen(false)} />
                    <div className="filter-sheet open is-visible no-transition" role="dialog" aria-modal aria-label="Filtres avancés">
                        <div className="sheet-handle" onClick={() => setSheetOpen(false)}>
                            <div className="handle-bar" />
                        </div>
                        <div className="sheet-hdr">
                            <span className="sheet-hdr-title">
                                ⚙ FILTRES
                                {activeCount > 0 && <span className="sheet-active-count show">{activeCount}</span>}
                            </span>
                            <button className="sheet-reset" onClick={resetFilters}>TOUT EFFACER</button>
                        </div>
                        <div className="sheet-body">
                            <div className="sheet-section-lbl">📂 Catégorie</div>
                            <div className="cat-grid">
                                {Object.keys(CAT_ICONS).filter(k => k !== 'default').sort().map(cat => (
                                    <button
                                        key={cat}
                                        className={`cat-btn ${filters.categories?.includes(cat) ? 'active' : ''}`}
                                        onClick={() => toggleCategory(cat)}
                                    >
                                        <span className="cat-ico">{CAT_ICONS[cat]}</span>
                                        {cat.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            <div className="sheet-section-lbl">📅 Année de sortie</div>
                            <div className="year-grid">
                                {YEARS.map(y => (
                                    <button
                                        key={y}
                                        className={`year-pill ${filters.years?.includes(y) ? 'active' : ''}`}
                                        onClick={() => toggleYear(y)}
                                    >
                                        {y}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="sheet-footer">
                            <button className="apply-btn" onClick={() => setSheetOpen(false)}>
                                VOIR — {total} JEUX ▶
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
