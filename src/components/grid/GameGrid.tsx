import { useEffect, useRef, useState } from 'react';
import { fetchAvailableYears, fetchGames, fetchGamesCount } from '../../share/models/games';
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
            search:            typeof f.search === 'string' ? f.search : '',
            parent_categories: Array.isArray(f.parent_categories) ? f.parent_categories : [],
            child_categories:  Array.isArray(f.child_categories)  ? f.child_categories  : [],
            years:             Array.isArray(f.years) ? f.years.map(Number).filter(Boolean) : [],
        };
    } catch { return null; }
}


const PARENT_CATS: { name: string; icon: string }[] = [
    { name: 'JEU',            icon: '🎮' },
    { name: 'DEMO',           icon: '💿' },
    { name: 'COMPILATION',    icon: '📦' },
    { name: 'UTILITAIRE',     icon: '🔧' },
    { name: 'EDUCATIF',       icon: '📚' },
    { name: 'DIVERS',         icon: '🗂️' },
];

const CHILD_CATS: Record<string, { name: string; icon: string }[]> = {
    'JEU': [
        { name: 'Action',         icon: '⚔️' },
        { name: 'Réflexion',      icon: '🧩' },
        { name: 'Aventure',       icon: '🗺️' },
        { name: 'Plates-Formes',  icon: '🏃' },
        { name: "Shoot'Em Up",    icon: '🚀' },
        { name: 'Labyrinthe',     icon: '🌀' },
        { name: 'Sport',          icon: '⚽' },
        { name: 'Run & Gun',      icon: '🔫' },
        { name: 'Jeu de Café',    icon: '🕹️' },
        { name: 'Course',         icon: '🏎️' },
        { name: 'Simulation',     icon: '✈️' },
        { name: 'Combat',         icon: '🥊' },
        { name: 'Stratégie',      icon: '♟️' },
        { name: 'Casse-Briques',  icon: '🧱' },
        { name: 'Quiz',           icon: '❓' },
        { name: 'Tir sur Cibles', icon: '🎯' },
        { name: 'Gestion',        icon: '📊' },
        { name: 'Jeu de Rôle',    icon: '🐉' },
    ],
    'DEMO': [
        { name: 'Divers',     icon: '🗂️' },
        { name: 'Graphisme',  icon: '🎨' },
        { name: 'Son',        icon: '🎵' },
    ],
    'UTILITAIRE': [
        { name: 'Divers',                              icon: '🗂️' },
        { name: 'Outils pour disquettes et cassettes', icon: '💾' },
        { name: 'Graphisme',                           icon: '🎨' },
        { name: 'Base de donnees',                     icon: '🗄️' },
        { name: 'Son',                                 icon: '🎵' },
        { name: 'Bureautique et communication',        icon: '📠' },
    ],
    'EDUCATIF': [
        { name: 'Cours, Tutoriaux',          icon: '📖' },
        { name: 'Divers',                    icon: '🗂️' },
        { name: 'Maths, Geometrie',          icon: '📐' },
        { name: 'Orthographe, Grammaire',    icon: '✏️' },
        { name: 'Histoire, Geographie',      icon: '🌍' },
    ],
    'DIVERS': [
        { name: 'DiscMag',        icon: '📰' },
        { name: 'CrackTro',       icon: '💥' },
        { name: 'Trainer',        icon: '🛠️' },
        { name: 'Prevision',      icon: '🔮' },
        { name: 'JAMAIS SORTI ?', icon: '❌' },
    ],
    'COMPILATION': [],
};


const PARENT_NAMES  = new Set(PARENT_CATS.map(p => p.name));
const ALL_CHILD_NAMES = new Set(Object.values(CHILD_CATS).flat().map(c => c.name));

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

    // Écoute le bouton FILTRES dans le header
    useEffect(() => {
        const handler = () => setSheetOpen(true);
        window.addEventListener('retro:open-filters', handler);
        return () => window.removeEventListener('retro:open-filters', handler);
    }, []);
    const [offset, setOffset]       = useState(initialGames.length);
    const [hasMore, setHasMore]     = useState(initialGames.length === BATCH_SIZE);
    const [isLoading, setIsLoading] = useState(false);
    const [filters, setFilters]     = useState<GameFilters>(() => loadFilters() ?? { parent_categories: [], child_categories: [], years: [] });
    const [availableYears, setAvailableYears] = useState<number[]>([]);
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

    // On mount — écoute le signal de boot ou affiche immédiatement pour les visiteurs de retour
    useEffect(() => {
        const el = stickyRef.current;
        if (!el) return;

        if (localStorage.getItem('amstariga_visited')) {
            el.classList.add('is-visible', 'no-transition');
        } else {
            const handler = () => el.classList.add('is-visible');
            window.addEventListener('retro:chipbar-show', handler, { once: true });
            return () => window.removeEventListener('retro:chipbar-show', handler);
        }
    }, []);

    // Recharge les années disponibles quand les catégories ou is_adult changent
    // et purge les années sélectionnées qui ne sont plus dans la liste
    useEffect(() => {
        fetchAvailableYears({
            parent_categories: filters.parent_categories,
            child_categories:  filters.child_categories,
            is_adult:          filters.is_adult,
        }).then(years => {
            setAvailableYears(years);
            const validSet = new Set(years);
            const invalidYears = (filters.years ?? []).filter(y => !validSet.has(y));
            if (invalidYears.length > 0) {
                const cleaned = (filters.years ?? []).filter(y => validSet.has(y));
                applyFilters({ ...filters, years: cleaned });
            }
        }).catch(() => {});
    }, [JSON.stringify(filters.parent_categories), JSON.stringify(filters.child_categories), filters.is_adult]);

    // On mount — refetch si des filtres sauvegardés sont actifs
    useEffect(() => {
        const saved = loadFilters();
        if (!saved) return;
        const hasActive = (saved.categories?.length ?? 0) + (saved.years?.length ?? 0) + (saved.search ? 1 : 0) > 0;
        if (!hasActive) return;
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
    // Désactivé en vue carousel : pas de scroll, le sentinel resterait toujours visible
    useEffect(() => {
        if (view === 'cover') return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMore();
        }, { rootMargin: '200px' });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [view]);

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
        const parents  = filters.parent_categories ?? [];
        const children = filters.child_categories  ?? [];

        if (PARENT_NAMES.has(cat)) {
            if (parents.includes(cat)) {
                // Déselection d'un type : retirer le type ET ses genres enfants
                const itsChildren = new Set((CHILD_CATS[cat] ?? []).map(c => c.name));
                applyFilters({
                    ...filters,
                    parent_categories: parents.filter(p => p !== cat),
                    child_categories:  children.filter(c => !itsChildren.has(c)),
                });
            } else {
                // Sélection d'un nouveau type : purger les genres qui n'appartiennent plus aux types restants
                const nextParents     = [...parents, cat];
                const allowedChildren = new Set(nextParents.flatMap(p => (CHILD_CATS[p] ?? []).map(c => c.name)));
                applyFilters({
                    ...filters,
                    parent_categories: nextParents,
                    child_categories:  children.filter(c => allowedChildren.has(c)),
                });
            }
        } else {
            // Genre enfant — toggle simple
            const next = children.includes(cat) ? children.filter(c => c !== cat) : [...children, cat];
            applyFilters({ ...filters, child_categories: next });
        }
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
        applyFilters({ parent_categories: [], child_categories: [], years: [] });
    }

    function toggleAdult() {
        applyFilters({ ...filters, is_adult: filters.is_adult === true ? undefined : true });
    }

    /** Total number of active filter criteria (used for the badge counter). */
    const activeCount =
        (filters.parent_categories?.length ?? 0) +
        (filters.child_categories?.length  ?? 0) +
        (filters.years?.length             ?? 0) +
        (filters.is_adult !== undefined ? 1 : 0);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('retro:filter-count', { detail: { count: activeCount } }));
    }, [activeCount]);

    const selectedParents = filters.parent_categories ?? [];
    const baseGenres = selectedParents.length > 0
        ? selectedParents.flatMap(p => CHILD_CATS[p] ?? [])
        : Object.values(CHILD_CATS).flat();
    // Toujours afficher les genres déjà sélectionnés même s'ils ne sont plus dans la liste de base
    const selectedChildNames = new Set(filters.child_categories ?? []);
    const extraGenres = Object.values(CHILD_CATS).flat().filter(
        g => selectedChildNames.has(g.name) && !baseGenres.some(b => b.name === g.name)
    );
    // Dédupliquer par nom.
    // Si aucun parent n'est sélectionné, masquer les genres homonymes d'un parent
    // (ex: "Divers" enfant serait ambigu avec "DIVERS" type — on ne l'affiche qu'une fois un parent choisi)
    const parentNamesLower = new Set(PARENT_CATS.map(p => p.name.toLowerCase()));
    const noParentSelected = selectedParents.length === 0;
    const seen = new Set<string>();
    const visibleGenres = [...baseGenres, ...extraGenres].filter(g => {
        if (seen.has(g.name)) return false;
        if (noParentSelected && parentNamesLower.has(g.name.toLowerCase())) return false;
        seen.add(g.name);
        return true;
    });

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
                    {PARENT_CATS.map(({ name, icon }) => (
                        <button
                            key={name}
                            className={`fchip ${filters.parent_categories?.includes(name) ? 'fchip-active' : ''}`}
                            onClick={() => toggleCategory(name)}
                        >
                            {icon} {name}
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
                        {filters.parent_categories?.map(cat => (
                            <span key={cat} className="atag" onClick={() => toggleCategory(cat)}>
                                {cat} <span className="atag-x">&times;</span>
                            </span>
                        ))}
                        {filters.child_categories?.map(cat => (
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
                    filters={filters}
                    onChange={val => setFilters(f => ({ ...f, search: val }))}
                    onSubmit={val => applyFilters({ ...filters, search: val })}
                />
            </div>

            {/* Spacer pour éviter que le contenu passe sous le sticky */}
            <div style={{ height: stickyH }} />


            {/* ── Carousel ou Grille ── */}
            {view === 'cover' ? (
                <Carousel
                    games={games}
                    total={total}
                    initialIndex={(() => { try { return parseInt(localStorage.getItem(LS_CAROUSEL) ?? '0', 10) || 0; } catch { return 0; } })()}
                    topOffset={stickyH}
                    onNearEnd={() => loadMore()}
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
                            <div className="sheet-section-lbl">🗃️ Type</div>
                            <div className="cat-grid">
                                {PARENT_CATS.map(({ name, icon }) => (
                                    <button
                                        key={name}
                                        className={`cat-btn ${filters.parent_categories?.includes(name) ? 'active' : ''}`}
                                        onClick={() => toggleCategory(name)}
                                    >
                                        <span className="cat-ico">{icon}</span>
                                        {name}
                                    </button>
                                ))}
                                <button
                                    className={`cat-btn ${filters.is_adult === true ? 'active' : ''}`}
                                    onClick={toggleAdult}
                                >
                                    <span className="cat-ico">🔞</span>
                                    ADULT
                                </button>
                            </div>
                            {visibleGenres.length > 0 && (
                                <>
                                    <div className="sheet-section-lbl">📂 Genre</div>
                                    <div className="cat-grid">
                                        {visibleGenres.map(({ name, icon }) => (
                                            <button
                                                key={name}
                                                className={`cat-btn ${filters.child_categories?.includes(name) ? 'active' : ''}`}
                                                onClick={() => toggleCategory(name)}
                                            >
                                                <span className="cat-ico">{icon}</span>
                                                {name.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            {availableYears.length > 0 && (
                                <>
                                    <div className="sheet-section-lbl">📅 Année de sortie</div>
                                    <div className="year-grid">
                                        {availableYears.map(y => (
                                            <button
                                                key={y}
                                                className={`year-pill ${filters.years?.includes(y) ? 'active' : ''}`}
                                                onClick={() => toggleYear(y)}
                                            >
                                                {y}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
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
