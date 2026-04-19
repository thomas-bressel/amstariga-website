import { useEffect, useRef, useState } from 'react';
import { fetchGames, fetchGamesCount } from '../../share/models/games';
import type { GameFilters, GameListItem } from '../../share/types/game';
import { thumbnailPath } from '../../share/utils/thumbnail';
import Carousel from '../carousel/Carousel';
import SearchBar from './SearchBar';
import './GameGrid.css';

/** Number of games fetched per infinite-scroll batch. */
const BATCH_SIZE = 50;

const LS_KEY      = 'amstariga_filters';
const LS_SCROLL   = 'amstariga_scroll';
const LS_CAROUSEL = 'amstariga_carousel_index';

function saveFilters(f: GameFilters) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch {}
}

function loadFilters(): GameFilters | null {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const f = JSON.parse(raw) as GameFilters;
        if (!f || typeof f !== 'object') return null;
        return {
            search:     typeof f.search === 'string' ? f.search : '',
            categories: Array.isArray(f.categories) ? f.categories : [],
            years:      Array.isArray(f.years) ? f.years.map(Number).filter(Boolean) : [],
        };
    } catch { return null; }
}

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
    const [filters, setFilters]     = useState<GameFilters>(() => loadFilters() ?? { categories: [], years: [] });
    const [sheetOpen, setSheetOpen] = useState(false);
    const [view, setView]           = useState<'grid' | 'cover'>(() => {
        try { return (localStorage.getItem('amstariga_view') as 'grid' | 'cover') || 'cover'; } catch { return 'cover'; }
    });

    useEffect(() => {
        document.body.style.overflowY = view === 'cover' ? 'hidden' : '';
        document.body.style.overflowX = '';

        if (view === 'grid') {
            // Restore grid scroll position after the DOM has painted
            requestAnimationFrame(() => {
                const saved = parseInt(localStorage.getItem(LS_SCROLL) ?? '0', 10);
                if (saved > 0) window.scrollTo({ top: saved, behavior: 'instant' });
            });
            // Save scroll position as the user scrolls
            const onScroll = () => {
                try { localStorage.setItem(LS_SCROLL, String(Math.round(window.scrollY))); } catch {}
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            return () => {
                window.removeEventListener('scroll', onScroll);
                document.body.style.overflowY = '';
            };
        }

        return () => { document.body.style.overflowY = ''; };
    }, [view]);

    const sentinelRef   = useRef<HTMLDivElement>(null);
    const filtersRef    = useRef<GameFilters>(filters);
    const offsetRef     = useRef(offset);
    const stickyRef     = useRef<HTMLDivElement>(null);
    const [stickyH, setStickyH] = useState(0);

    // Measure sticky bar height whenever filters change (it may wrap)
    useEffect(() => {
        if (!stickyRef.current) return;
        const obs = new ResizeObserver(([e]) => setStickyH(e.contentRect.height));
        obs.observe(stickyRef.current);
        return () => obs.disconnect();
    }, []);

    // Keep refs in sync so the IntersectionObserver callback sees fresh values.
    filtersRef.current = filters;
    offsetRef.current  = offset;

    // On mount — show chip bar for returning visitors + refetch if saved filters exist
    useEffect(() => {
        const chipbar = document.querySelector('.filter-chip-bar');
        if (chipbar && localStorage.getItem('amstariga_visited')) {
            chipbar.classList.add('is-visible', 'no-transition');
        }

        const saved = loadFilters();
        if (!saved) return;
        const hasActive = (saved.categories?.length ?? 0) + (saved.years?.length ?? 0) + (saved.search ? 1 : 0) > 0;
        if (!hasActive) return;
        // Filters already set in useState initializer — just refetch with them
        setIsLoading(true);
        Promise.all([
            fetchGames(saved, BATCH_SIZE, 0),
            fetchGamesCount(saved),
        ]).then(([batch, count]) => {
            const safeBatch = batch ?? [];
            setGames(safeBatch);
            setTotal(count);
            setOffset(safeBatch.length);
            setHasMore(safeBatch.length === BATCH_SIZE);
        }).finally(() => setIsLoading(false));
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
            try { localStorage.setItem('amstariga_view', v); } catch {}
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
        saveFilters(next);
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
        try { localStorage.removeItem(LS_KEY); } catch {}
        applyFilters({ categories: [], years: [] });
    }

    function toggleAdult() {
        applyFilters({ ...filters, is_adult: filters.is_adult === true ? undefined : true });
    }

    /** Total number of active filter criteria (used for the badge counter). */
    const activeCount = (filters.categories?.length ?? 0) + (filters.years?.length ?? 0) + (filters.is_adult !== undefined ? 1 : 0);

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    return (
        <div>
            {/* ── Sticky wrapper : chip bar + active strip + search ── */}
            <div className="filters-sticky" ref={stickyRef}>
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
                    <button
                        className={`fchip ${filters.is_adult === true ? 'fchip-active' : ''}`}
                        onClick={toggleAdult}
                    >
                        🔞 ADULT
                    </button>
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
                        {filters.is_adult === true && (
                            <span className="atag" onClick={toggleAdult}>
                                🔞 ADULT <span className="atag-x">&times;</span>
                            </span>
                        )}
                    </div>
                )}

                {/* ── Search bar ── */}
                <SearchBar
                    value={filters.search ?? ''}
                    onChange={val => setFilters(f => ({ ...f, search: val }))}
                    onSubmit={val => applyFilters({ ...filters, search: val })}
                />
            </div>

            {/* Spacer pour éviter que le contenu passe sous le sticky */}
            <div style={{ height: stickyH }} />

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
                <Carousel
                    games={games}
                    initialIndex={(() => { try { return parseInt(localStorage.getItem(LS_CAROUSEL) ?? '0', 10) || 0; } catch { return 0; } })()}
                    topOffset={stickyH}
                />
            ) : (
                <div className="games-container" style={{ marginTop: stickyH }}>
                    {games.map(game => (
                        <a key={game.id} className="game-card screenshot-mode" href={`/game/${game.id}`}>
                            <div className="game-screenshot">
                                <img
                                    src={thumbnailPath(game)}
                                    alt={game.main_title}
                                    loading="lazy"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
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
