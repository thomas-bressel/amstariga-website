import { useEffect, useRef, useState } from 'react';
import { fetchGames, fetchGamesCount } from '../share/models/games';
import type { GameFilters, GameListItem } from '../share/types/game';
import Carousel from './Carousel';

const BATCH_SIZE = 50;

const CAT_ICONS: Record<string, string> = {
    'Action':       '⚔️',
    'Aventure':     '🗺️',
    'Plateforme':   '🏃',
    'Puzzle':       '🧩',
    'Course':       '🏎️',
    'Sport':        '⚽',
    'RPG':          '🐉',
    'Simulation':   '✈️',
    'Tir':          '🔫',
    'Arcade':       '🕹️',
    'default':      '🎮',
};

const YEARS: number[] = [];
for (let y = 1982; y <= 1999; y++) YEARS.push(y);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
    /** Initial games loaded by SSR (first 50). */
    initialGames: GameListItem[];
    /** Total count matching no filters (from SSR). */
    initialTotal: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GameGrid({ initialGames, initialTotal }: Props) {
    const [games, setGames]         = useState<GameListItem[]>(initialGames);
    const [total, setTotal]         = useState(initialTotal);
    const [offset, setOffset]       = useState(initialGames.length);
    const [hasMore, setHasMore]     = useState(initialGames.length === BATCH_SIZE);
    const [isLoading, setIsLoading] = useState(false);
    const [filters, setFilters]     = useState<GameFilters>({ categories: [], years: [] });
    const [sheetOpen, setSheetOpen] = useState(false);
    const [view, setView]           = useState<'grid' | 'cover'>('grid');

    const sentinelRef = useRef<HTMLDivElement>(null);
    const filtersRef  = useRef<GameFilters>(filters);
    const offsetRef   = useRef(offset);

    // Keep refs in sync so the IntersectionObserver callback sees fresh values.
    filtersRef.current = filters;
    offsetRef.current  = offset;

    // ------------------------------------------------------------------
    // Scroll infini — IntersectionObserver sur le sentinel en bas de page
    // ------------------------------------------------------------------

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: '200px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

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

    // ------------------------------------------------------------------
    // Changement de filtres — remet à zéro la liste
    // ------------------------------------------------------------------

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

    function toggleCategory(cat: string) {
        const cats = filters.categories ?? [];
        const next = cats.includes(cat) ? cats.filter(c => c !== cat) : [...cats, cat];
        applyFilters({ ...filters, categories: next });
    }

    function toggleYear(year: number) {
        const years = filters.years ?? [];
        const next  = years.includes(year) ? years.filter(y => y !== year) : [...years, year];
        applyFilters({ ...filters, years: next });
    }

    function resetFilters() {
        applyFilters({ categories: [], years: [] });
    }

    const activeCount = (filters.categories?.length ?? 0) + (filters.years?.length ?? 0);

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------

    return (
        <div>
            {/* ── Chip bar ── */}
            <div className="filter-chip-bar is-visible no-transition">
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

            {/* ── Stats + FAB ── */}
            <div className="stats-bar">
                <span><span>{total}</span> jeux</span>
                <div className="view-toggle">
                    <button
                        className={`view-btn ${view === 'grid' ? 'active' : ''}`}
                        onClick={() => setView('grid')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </button>
                    <button
                        className={`view-btn ${view === 'cover' ? 'active' : ''}`}
                        onClick={() => setView('cover')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>
            </div>

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
