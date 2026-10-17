import { useEffect, useRef, useState } from 'react';
import { fetchAvailableLanguages, fetchAvailableYears, fetchGames, fetchGamesCount } from '../../share/models/games';
import type { GameFilters, GameListItem, GameOrigin, Language } from '../../share/types/game';
import { FILTER_PARAMS, hasActiveFilters } from '../../share/utils/filters';
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
            languages:         Array.isArray(f.languages) ? f.languages.filter(l => typeof l === 'string') : [],
            years:             Array.isArray(f.years) ? f.years.map(Number).filter(Boolean) : [],
            is_adult:          f.is_adult === true ? true : undefined,
            origin:            f.origin === 'HUMAN' || f.origin === 'AI_ASSISTED' ? f.origin : undefined,
        };
    } catch { return null; }
}


/** Origine des jeux : classiques ou réalisés avec l'aide d'une IA. */
const ORIGINS: { value: GameOrigin; label: string; icon: string }[] = [
    { value: 'HUMAN',       label: 'HUMAIN',     icon: '👤' },
    { value: 'AI_ASSISTED', label: 'IA ASSISTÉ', icon: '🤖' },
];

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

const LANG_FLAGS: Record<string, string> = {
    eng: '🇬🇧', fra: '🇫🇷', deu: '🇩🇪', spa: '🇪🇸', ita: '🇮🇹',
    por: '🇵🇹', pol: '🇵🇱', dan: '🇩🇰', ell: '🇬🇷', tur: '🇹🇷',
    nld: '🇳🇱', swe: '🇸🇪', nor: '🇳🇴', fin: '🇫🇮', ces: '🇨🇿',
    hun: '🇭🇺', ron: '🇷🇴', rus: '🇷🇺', jpn: '🇯🇵', zho: '🇨🇳',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link GameGrid}. */
interface Props {
    /** Initial games loaded by SSR (first 50). */
    initialGames: GameListItem[];
    /** Total count matching the URL filters (from SSR). */
    initialTotal: number;
    /** Filters given in the page URL (?search=…), already applied by SSR to the two props above. */
    initialFilters?: GameFilters;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Main interactive game list with infinite scroll, category/year filters,
 * and a toggle between the 3-D carousel view and the flat grid view.
 *
 * State management:
 * - `games` — accumulate batches as the user scrolls (`offsetRef` / `hasMoreRef`)
 * - `filters` — filters of the displayed list, shared by the chip bar, the active-filters
 *   strip, and the bottom sheet
 * - `searchText` — text of the search bar, applied to the list on submit (or with any
 *   other filter change)
 * - `view` — `'cover'` (carousel, default) or `'grid'`
 *
 * Rendered on the client only (`client:only` in index.astro): its initial state comes from
 * localStorage (view, saved filters, carousel index), which the server cannot read, so a
 * server render would never match the first client render (hydration error).
 *
 * Cross-component communication (custom events on `window`):
 * - Dispatches `retro:count-update` when `total` changes, or on `retro:count-request` → updates {@link TapeCounter}
 * - Listens to `retro:view-change` → switches between carousel and grid
 *
 * @param initialGames   - First batch of games fetched by SSR.
 * @param initialTotal   - Total matching game count fetched by SSR.
 * @param initialFilters - Filters of the page URL, used instead of the saved ones.
 */
export default function GameGrid({ initialGames, initialTotal, initialFilters }: Props) {
    const [games, setGames]         = useState<GameListItem[]>(initialGames);
    const [total, setTotal]         = useState(initialTotal);

    // Sync total to TapeCounter in header, and send it again when the counter asks for it
    // (the counter may start listening after this island has sent the first total)
    useEffect(() => {
        const send = () => window.dispatchEvent(new CustomEvent('retro:count-update', { detail: { count: total } }));
        send();
        window.addEventListener('retro:count-request', send);
        return () => window.removeEventListener('retro:count-request', send);
    }, [total]);

    // Écoute le bouton FILTRES dans le header
    useEffect(() => {
        const handler = () => setSheetOpen(true);
        window.addEventListener('retro:open-filters', handler);
        return () => window.removeEventListener('retro:open-filters', handler);
    }, []);
    const [isLoading, setIsLoading] = useState(false);
    // Filtres de l'URL (déjà appliqués par le SSR), sinon ceux mémorisés à la dernière visite
    const [filters, setFilters]     = useState<GameFilters>(() =>
        (initialFilters && hasActiveFilters(initialFilters) ? initialFilters : loadFilters())
        ?? { parent_categories: [], child_categories: [], years: [] });
    const [searchText, setSearchText] = useState(filters.search ?? '');
    // Change à chaque nouvelle liste : le carrousel repart alors de l'index mémorisé
    const [listId, setListId]       = useState(0);
    const [availableYears, setAvailableYears]         = useState<number[]>([]);
    const [availableLanguages, setAvailableLanguages] = useState<Language[]>([]);
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
    const offsetRef     = useRef(initialGames.length);
    const hasMoreRef    = useRef(initialGames.length === BATCH_SIZE);
    const loadingRef    = useRef(false);
    // Incrémenté à chaque nouvelle liste : les réponses arrivées pour une liste précédente sont ignorées
    const generationRef = useRef(0);
    const stickyRef     = useRef<HTMLDivElement>(null);
    const [stickyH, setStickyH] = useState(0);

    // Measure sticky bar height whenever filters change (it may wrap)
    useEffect(() => {
        if (!stickyRef.current) return;
        const obs = new ResizeObserver(([e]) => setStickyH(e.contentRect.height));
        obs.observe(stickyRef.current);
        return () => obs.disconnect();
    }, []);

    // Keep the ref in sync so the IntersectionObserver callback sees fresh values.
    filtersRef.current = filters;

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

    // Recharge les langues disponibles quand les catégories changent
    // et purge les langues sélectionnées qui ne sont plus disponibles
    useEffect(() => {
        let stale = false;
        fetchAvailableLanguages({
            parent_categories: filters.parent_categories,
            child_categories:  filters.child_categories,
            years:             filters.years,
            is_adult:          filters.is_adult,
            origin:            filters.origin,
        }).then(langs => {
            if (stale) return;
            setAvailableLanguages(langs);
            const validSet = new Set(langs.map(l => l.iso_code));
            const current  = filtersRef.current;
            const invalidLangs = (current.languages ?? []).filter(l => !validSet.has(l));
            if (invalidLangs.length > 0) {
                applyFilters({ ...current, languages: (current.languages ?? []).filter(l => validSet.has(l)) });
            }
        }).catch(() => {});
        return () => { stale = true; };
    }, [JSON.stringify(filters.parent_categories), JSON.stringify(filters.child_categories), JSON.stringify(filters.years), filters.is_adult, filters.origin]);

    // Recharge les années disponibles quand les catégories ou is_adult changent
    // et purge les années sélectionnées qui ne sont plus dans la liste
    useEffect(() => {
        let stale = false;
        fetchAvailableYears({
            parent_categories: filters.parent_categories,
            child_categories:  filters.child_categories,
            is_adult:          filters.is_adult,
            origin:            filters.origin,
        }).then(years => {
            if (stale) return;
            setAvailableYears(years);
            const validSet = new Set(years);
            const current  = filtersRef.current;
            const invalidYears = (current.years ?? []).filter(y => !validSet.has(y));
            if (invalidYears.length > 0) {
                const cleaned = (current.years ?? []).filter(y => validSet.has(y));
                applyFilters({ ...current, years: cleaned });
            }
        }).catch(() => {});
        return () => { stale = true; };
    }, [JSON.stringify(filters.parent_categories), JSON.stringify(filters.child_categories), filters.is_adult, filters.origin]);

    // On mount — filtres de l'URL : déjà appliqués par le SSR, ils deviennent les filtres mémorisés
    // et quittent l'URL (recharger la page les réappliquerait sinon par-dessus les choix suivants).
    // Sinon, filtres mémorisés : la liste du SSR, sans filtre, est rechargée avec eux.
    useEffect(() => {
        if (initialFilters && hasActiveFilters(initialFilters)) {
            saveFilters(initialFilters);
            resetPosition();
            setListId(id => id + 1);
            const url = new URL(window.location.href);
            FILTER_PARAMS.forEach(p => url.searchParams.delete(p));
            window.history.replaceState(window.history.state, '', url);
            return;
        }
        const saved = loadFilters();
        if (saved && hasActiveFilters(saved)) applyFilters(saved, true);
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
     * Refs only: the IntersectionObserver keeps the closure of its first render.
     */
    async function loadMore() {
        if (loadingRef.current || !hasMoreRef.current) return;
        const generation = generationRef.current;
        loadingRef.current = true;
        setIsLoading(true);
        try {
            const batch = await fetchGames(filtersRef.current, BATCH_SIZE, offsetRef.current) ?? [];
            // Filtres changés entre-temps : ce lot appartient à l'ancienne liste
            if (generation !== generationRef.current) return;
            offsetRef.current += batch.length;
            hasMoreRef.current = batch.length === BATCH_SIZE;
            if (batch.length) setGames(prev => [...prev, ...batch]);
        } finally {
            if (generation === generationRef.current) {
                loadingRef.current = false;
                setIsLoading(false);
            }
        }
    }

    /**
     * Replaces the current game list with a fresh fetch using the given filters.
     * Resets the pagination so infinite scroll restarts from the beginning; responses
     * of requests started for a previous list (older search, next batch) are ignored.
     *
     * @param next    - The new filter state to apply.
     * @param restore - true when restoring the saved filters on load: the grid scroll
     *                  position and the carousel index of the last visit are kept.
     */
    async function applyFilters(next: GameFilters, restore = false) {
        const applied = { ...next, search: (next.search ?? '').trim() };
        if (applied.search !== (filtersRef.current.search ?? '')) setSearchText(applied.search);
        filtersRef.current = applied;
        setFilters(applied);
        saveFilters(applied);
        const generation = ++generationRef.current;
        loadingRef.current = true;
        setIsLoading(true);
        try {
            const [batch, count] = await Promise.all([
                fetchGames(applied, BATCH_SIZE, 0),
                fetchGamesCount(applied),
            ]);
            if (generation !== generationRef.current) return;
            const safeBatch = batch ?? [];
            offsetRef.current  = safeBatch.length;
            hasMoreRef.current = safeBatch.length === BATCH_SIZE;
            if (!restore) resetPosition();
            setGames(safeBatch);
            setTotal(count);
            setListId(id => id + 1);
        } finally {
            if (generation === generationRef.current) {
                loadingRef.current = false;
                setIsLoading(false);
            }
        }
    }

    /** New list: the grid goes back to the top and the carousel to the first game. */
    function resetPosition() {
        try {
            localStorage.setItem(LS_SCROLL, '0');
            localStorage.setItem(LS_CAROUSEL, '0');
        } catch {}
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    /**
     * Applies a change to the filters together with the text of the search bar, so that
     * the list always matches what the search bar shows.
     *
     * @param changes - The filters to change.
     */
    function updateFilters(changes: GameFilters) {
        applyFilters({ ...filters, search: searchText, ...changes });
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
                updateFilters({
                    parent_categories: parents.filter(p => p !== cat),
                    child_categories:  children.filter(c => !itsChildren.has(c)),
                });
            } else {
                // Sélection d'un nouveau type : purger les genres qui n'appartiennent plus aux types restants
                const nextParents     = [...parents, cat];
                const allowedChildren = new Set(nextParents.flatMap(p => (CHILD_CATS[p] ?? []).map(c => c.name)));
                updateFilters({
                    parent_categories: nextParents,
                    child_categories:  children.filter(c => allowedChildren.has(c)),
                });
            }
        } else {
            // Genre enfant — toggle simple
            const next = children.includes(cat) ? children.filter(c => c !== cat) : [...children, cat];
            updateFilters({ child_categories: next });
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
        updateFilters({ years: next });
    }

    function toggleLanguage(iso: string) {
        const langs = filters.languages ?? [];
        const next  = langs.includes(iso) ? langs.filter(l => l !== iso) : [...langs, iso];
        updateFilters({ languages: next });
    }

    /** Clears all active filters and the search bar, and reloads the full game list. */
    function resetFilters() {
        try { localStorage.removeItem(LS_KEY); } catch {}
        setSearchText('');
        applyFilters({ parent_categories: [], child_categories: [], languages: [], years: [] });
    }

    function toggleAdult() {
        updateFilters({ is_adult: filters.is_adult === true ? undefined : true });
    }

    /** Toggles the origin filter (human / AI-assisted games); clicking the active one clears it. */
    function toggleOrigin(origin: GameOrigin) {
        updateFilters({ origin: filters.origin === origin ? undefined : origin });
    }

    /** Total number of active filter criteria (used for the badge counter). */
    const activeCount =
        (filters.parent_categories?.length ?? 0) +
        (filters.child_categories?.length  ?? 0) +
        (filters.languages?.length         ?? 0) +
        (filters.years?.length             ?? 0) +
        (filters.is_adult !== undefined ? 1 : 0) +
        (filters.origin ? 1 : 0);

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
            {/* ── Sticky wrapper : active strip + search ── */}
            <div className="filters-sticky" ref={stickyRef}>
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
                        {filters.languages?.map(iso => (
                            <span key={iso} className="atag" onClick={() => toggleLanguage(iso)}>
                                {LANG_FLAGS[iso] ?? '🌐'} {iso.toUpperCase()} <span className="atag-x">&times;</span>
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
                        {filters.origin && (
                            <span className="atag" onClick={() => toggleOrigin(filters.origin!)}>
                                {ORIGINS.find(o => o.value === filters.origin)?.icon} {ORIGINS.find(o => o.value === filters.origin)?.label}
                                {' '}<span className="atag-x">&times;</span>
                            </span>
                        )}
                    </div>
                )}

                {/* ── Search bar ── */}
                <SearchBar
                    value={searchText}
                    filters={filters}
                    onChange={setSearchText}
                    onSubmit={term => updateFilters({ search: term })}
                />
            </div>

            {/* Spacer pour éviter que le contenu passe sous le sticky */}
            <div style={{ height: stickyH }} />


            {/* ── Carousel ou Grille ── */}
            {view === 'cover' ? (
                <Carousel
                    games={games}
                    listId={listId}
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
                                {game.origin === 'AI_ASSISTED' && (
                                    <span className="ai-badge" title="Jeu réalisé avec l'aide d'une IA">IA</span>
                                )}
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
                            <div className="sheet-section-lbl">🤖 Origine</div>
                            <div className="cat-grid">
                                {ORIGINS.map(({ value, label, icon }) => (
                                    <button
                                        key={value}
                                        className={`cat-btn ${filters.origin === value ? 'active' : ''}`}
                                        onClick={() => toggleOrigin(value)}
                                    >
                                        <span className="cat-ico">{icon}</span>
                                        {label}
                                    </button>
                                ))}
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
                            {availableLanguages.length > 0 && (
                                <>
                                    <div className="sheet-section-lbl">🌐 Langue</div>
                                    <div className="lang-grid">
                                        {availableLanguages.map(({ iso_code, name }) => (
                                            <button
                                                key={iso_code}
                                                className={`lang-btn ${filters.languages?.includes(iso_code) ? 'active' : ''}`}
                                                onClick={() => toggleLanguage(iso_code)}
                                            >
                                                <span className="lang-flag">{LANG_FLAGS[iso_code] ?? '🌐'}</span>
                                                {name}
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
