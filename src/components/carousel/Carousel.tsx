import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameListItem } from '../../share/types/game';
import { machineBadge } from '../../share/utils/machines';
import { gameUrl } from '../../share/utils/slug';
import { thumbnailPath } from '../../share/utils/thumbnail';
import './Carousel.css';

/** Angular step in degrees between adjacent carousel slots. */
const STEP = 18;

/** Wheel distance (px) for one card: one notch of a mouse wheel, a short swipe on a touchpad. */
const WHEEL_PX_PER_CARD = 100;

/** Finger distance (px) for one card when dragging on a touch screen. */
const DRAG_PX_PER_CARD = 120;

/** Response time (ms) of the carousel following its target: smooth, without lag. */
const FOLLOW_MS = 110;

/** Wheel idle time (ms) after which the carousel settles on the nearest card. */
const SNAP_DELAY_MS = 140;

/** How far (in cards) the target may run ahead of the carousel (fast wheel). */
const MAX_AHEAD = 8;

/** Size of the thumbnails chosen with the header knob (localStorage, 1 = 100 %). */
function savedZoom(): number {
    try {
        const zoom = parseInt(localStorage.getItem('amstariga_zoom') ?? '', 10) / 100;
        return zoom >= 0.7 && zoom <= 1.5 ? zoom : 1;
    } catch {
        return 1;
    }
}

/**
 * Returns radius and slot offsets based on viewport width. On desktop (769 px and more) the
 * cards follow the zoom of the header knob, and so does the radius of the wheel.
 */
function getLayout(width: number, zoom = 1): { radius: number; slots: number[] } {
    const scale = width >= 769 ? zoom : 1;
    if (width >= 1600) return { radius: 900 * scale, slots: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] };
    if (width >= 1200) return { radius: 750 * scale, slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4] };
    return                     { radius: 600 * scale, slots: [-3, -2, -1, 0, 1, 2, 3] };
}

/** Positive modulo: game index of an unbounded carousel position. */
function wrap(position: number, count: number): number {
    return count ? ((position % count) + count) % count : 0;
}

/**
 * Value at a distance from the centre, interpolated between the values of whole slots
 * (levels[0] at the centre, the last one beyond), fading out past the outermost slot.
 */
function fade(distance: number, levels: number[], edge: number): number {
    const a = Math.abs(distance);
    const i = Math.min(Math.floor(a), levels.length - 1);
    const next = levels[Math.min(i + 1, levels.length - 1)];
    const value = levels[i] + (next - levels[i]) * Math.min(1, a - i);
    return a > edge ? Math.max(0, value * (edge + 1 - a)) : value;
}

const CARD_OPACITY   = [1, 0.75, 0.45, 0.2];
const SHADOW_OPACITY = [0.85, 0.5, 0.2];

/** Images to try for a game card: the front cover of the box, then the game thumbnail. */
function coverSources(game: GameListItem): string[] {
    return [game.cover, thumbnailPath(game)].filter((src): src is string => !!src);
}

/**
 * Card picture: box front cover, else thumbnail, else the 📦 placeholder (missing or broken
 * images). The picture fades in once loaded: no broken image or alt text while it loads.
 */
function CoverImage({ game, failed, onFail }: { game: GameListItem; failed: Set<string>; onFail: (src: string) => void }) {
    const src = coverSources(game).find(s => !failed.has(s));
    const [loaded, setLoaded] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    // Image déjà en cache (préchargée) : affichée sans attendre l'événement load
    useLayoutEffect(() => {
        const img = imgRef.current;
        if (src && img?.complete && img.naturalWidth > 0) setLoaded(src);
    }, [src]);
    if (!src) {
        return <span className="carousel-placeholder">📦</span>;
    }
    return (
        <img
            ref={imgRef}
            className={`carousel-cover${src === game.cover ? ' is-box' : ''}${loaded === src ? ' is-loaded' : ''}`}
            src={src}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(src)}
            onError={() => onFail(src)}
        />
    );
}

/** Props for {@link Carousel}. */
interface Props {
    /** Full list of games to cycle through. */
    games: GameListItem[];
    /** Total number of games (may exceed games.length if not all loaded yet). */
    total?: number;
    /** Index to start at (restored from localStorage). */
    initialIndex?: number;
    /** Changes when the list is replaced (search, filters): the carousel restarts at initialIndex. */
    listId?: number;
    /** Top offset in px to avoid collision with the sticky filter bar. */
    topOffset?: number;
    /** Called when the user navigates near the end of loaded games, to trigger a new batch fetch. */
    onNearEnd?: () => void;
}

/**
 * CSS 3-D rotating carousel for the game cover view.
 *
 * The carousel has a continuous position (in cards) that smoothly follows a target:
 * - Mouse wheel and touchpad move the target continuously (passive: false so
 *   `preventDefault` works); once the wheel rests, the target settles on the nearest card.
 * - Prev/next buttons move the target by exactly one card.
 * - On touch screens the carousel follows the finger, then settles on a card.
 * Card transforms are written in an animation frame loop, without re-rendering React; React
 * only renders when the centre card changes. Each card is keyed by its unbounded position,
 * so a card keeps its element and its image while the carousel turns.
 *
 * Visibility is controlled by `retro:carousel-show` (first visit, fired by the
 * CRT boot sequence) or by reading `amstariga_visited` from localStorage
 * (returning visitors — shown immediately, no animation).
 *
 * @param games - Array of games to display; renders nothing if empty.
 */
export default function Carousel({ games, total, initialIndex = 0, topOffset = 0, listId = 0, onNearEnd }: Props) {
    const startIndex = (count: number) => wrap(initialIndex, count);
    // Carte au centre (entier, position sans fin) : cartes rendues, titre, compteur
    const [center, setCenter]       = useState(() => startIndex(games.length));
    const [shownList, setShownList] = useState(listId);
    const [layout, setLayout]       = useState(() => getLayout(1200));
    // Position affichée (en cartes, décimale pendant le mouvement) et position visée
    const position                  = useRef(center);
    const target                    = useRef(center);
    const frame                     = useRef(0);
    const lastTime                  = useRef(0);
    const snapTimer                 = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const items                     = useRef(new Map<number, HTMLDivElement>());
    const shadows                   = useRef(new Map<number, HTMLDivElement>());
    const layoutRef                 = useRef(layout);
    layoutRef.current               = layout;
    const containerRef              = useRef<HTMLDivElement>(null);
    const touch                     = useRef({ x: 0, from: 0, active: false, dragged: false });
    const reducedMotion             = useRef(false);
    const preloaded                 = useRef(new Set<string>());
    const [failed, setFailed]       = useState<Set<string>>(() => new Set());
    const markFailed = useCallback((src: string) => {
        setFailed(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
    }, []);

    useEffect(() => {
        let zoom = savedZoom();
        setLayout(getLayout(window.innerWidth, zoom));
        reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const onResize = () => setLayout(getLayout(window.innerWidth, zoom));
        // Molette du header : nouvelle taille des cartes
        const onZoom = (e: Event) => {
            zoom = (e as CustomEvent<{ zoom: number }>).detail.zoom;
            setLayout(getLayout(window.innerWidth, zoom));
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('retro:zoom', onZoom);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('retro:zoom', onZoom);
        };
    }, []);

    const { slots } = layout;
    const count = games.length;
    const index = wrap(center, count);
    const displayTotal = total ?? count;
    // Une carte de plus de chaque côté : elle apparaît et disparaît en fondu pendant le mouvement
    const offsets = [slots[0] - 1, ...slots, slots[slots.length - 1] + 1];

    /** Places every card and shadow for the current position (no React render). */
    const paint = useCallback(() => {
        const pos = position.current;
        const { radius, slots } = layoutRef.current;
        const edge = slots[slots.length - 1];
        items.current.forEach((el, i) => {
            const d = i - pos;
            const abs = Math.abs(d);
            el.style.transform = `rotateY(${d * STEP}deg) translateZ(${radius}px)`;
            el.style.opacity = String(fade(d, CARD_OPACITY, edge));
            el.style.visibility = abs > edge + 1 ? 'hidden' : '';
            el.classList.toggle('is-active', abs < 0.5);
            el.classList.toggle('is-adjacent', abs >= 0.5 && abs < 1.5);
        });
        shadows.current.forEach((el, i) => {
            const d = i - pos;
            el.style.transform = `rotateY(${d * STEP}deg) translateZ(${radius}px) rotateX(90deg) scaleY(1.8)`;
            el.style.opacity = String(fade(d, SHADOW_OPACITY, edge));
        });
    }, []);

    /** One animation frame: the position catches up with the target, damped. */
    const animate = useCallback((now: number) => {
        const dt = lastTime.current ? Math.min(64, now - lastTime.current) : 16;
        lastTime.current = now;
        const goal = target.current;
        const k = reducedMotion.current ? 1 : 1 - Math.exp(-dt / FOLLOW_MS);
        let next = position.current + (goal - position.current) * k;
        if (Math.abs(goal - next) < 0.002) next = goal;
        position.current = next;
        paint();
        const nearest = Math.round(next);
        setCenter(c => (c === nearest ? c : nearest));
        if (next !== goal || touch.current.active) {
            frame.current = requestAnimationFrame(animate);
        } else {
            frame.current = 0;
            lastTime.current = 0;
        }
    }, [paint]);

    const run = useCallback(() => {
        if (!frame.current) frame.current = requestAnimationFrame(animate);
    }, [animate]);

    /** Moves the target, never too far ahead of the carousel. */
    const aim = useCallback((goal: number) => {
        const pos = position.current;
        target.current = Math.max(pos - MAX_AHEAD, Math.min(pos + MAX_AHEAD, goal));
        run();
    }, [run]);

    /**
     * Rotates the carousel by one card in the given direction (buttons). Clicks in a row add up.
     *
     * @param direction - `1` to advance (next), `-1` to go back (prev).
     */
    const move = useCallback((direction: number) => {
        if (!count) return;
        aim(Math.round(target.current) + direction);
    }, [count, aim]);

    useEffect(() => () => {
        cancelAnimationFrame(frame.current);
        clearTimeout(snapTimer.current);
    }, []);

    // Nouvelles cartes rendues (centre changé, autre largeur) : placées avant d'être affichées
    useLayoutEffect(() => { paint(); }, [center, layout, count, paint]);

    // Charge le batch suivant quand on approche les 10 derniers jeux chargés
    useEffect(() => {
        if (onNearEnd && total && index >= count - 10 && count < total) {
            onNearEnd();
        }
        try { localStorage.setItem('amstariga_carousel_index', String(index)); } catch {}
    }, [index]);

    // Images des cartes visibles et des suivantes, de part et d'autre : prêtes quand elles
    // entrent dans le carrousel ; une image absente est repérée avant d'être montrée
    useEffect(() => {
        if (!count) return;
        const reach = slots[slots.length - 1] + 4;
        for (let offset = -reach; offset <= reach; ++offset) {
            const src = coverSources(games[wrap(center + offset, count)]).find(s => !failed.has(s));
            if (!src || preloaded.current.has(src)) continue;
            preloaded.current.add(src);
            const img = new Image();
            img.decoding = 'async';
            img.onerror = () => markFailed(src);
            img.src = src;
        }
    }, [center, games, slots, failed]);

    // Show carousel — immediately on return visit, or via boot event on first visit
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (localStorage.getItem('amstariga_visited')) {
            setVisible(true);
            return;
        }
        const handler = () => setVisible(true);
        window.addEventListener('retro:carousel-show', handler);
        return () => window.removeEventListener('retro:carousel-show', handler);
    }, []);

    // Molette et pavé tactile : la cible avance avec le défilement (passive: false pour que
    // preventDefault empêche la page de défiler) ; au repos, calage sur la carte la plus proche
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handler = (e: WheelEvent) => {
            e.preventDefault();
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (delta === 0) return;
            const pixels = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? delta
                         : e.deltaMode === WheelEvent.DOM_DELTA_LINE  ? delta * 33
                         : delta * 400;
            aim(target.current + pixels / WHEEL_PX_PER_CARD);
            clearTimeout(snapTimer.current);
            snapTimer.current = setTimeout(() => aim(Math.round(target.current)), SNAP_DELAY_MS);
        };

        container.addEventListener('wheel', handler, { passive: false });
        return () => container.removeEventListener('wheel', handler);
    }, [aim]);

    // Nouvelle liste : l'index courant peut ne plus y exister. Rendu abandonné, React le
    // recommence aussitôt avec la nouvelle position.
    if (shownList !== listId) {
        const start = startIndex(count);
        setShownList(listId);
        setCenter(start);
        position.current = start;
        target.current = start;
        cancelAnimationFrame(frame.current);
        frame.current = 0;
        lastTime.current = 0;
        return null;
    }

    if (!count) return null;

    const active = games[index];

    return (
        <div
            ref={containerRef}
            className={`carousel-container${visible ? ' is-visible' : ''}`}
            style={{ paddingTop: topOffset }}
            onTouchStart={e => {
                touch.current = { x: e.touches[0].clientX, from: target.current, active: true, dragged: false };
                clearTimeout(snapTimer.current);
                run();
            }}
            onTouchMove={e => {
                const t = touch.current;
                const dx = e.touches[0].clientX - t.x;
                if (Math.abs(dx) > 8) t.dragged = true;
                aim(t.from - dx / DRAG_PX_PER_CARD);
            }}
            onTouchEnd={e => {
                const t = touch.current;
                t.active = false;
                const dx = e.changedTouches[0].clientX - t.x;
                let goal = Math.round(target.current);
                // Glissé franc mais court : au moins une carte dans le sens du geste
                if (goal === Math.round(t.from) && Math.abs(dx) > 40) goal += dx < 0 ? 1 : -1;
                aim(goal);
            }}
        >
            <div className="carousel-scene">
                <div className="carousel-wheel">
                    {offsets.map(offset => {
                        const i = center + offset;
                        return (
                            <div
                                key={`shadow-${i}`}
                                className="carousel-shadow"
                                ref={el => { if (el) shadows.current.set(i, el); else shadows.current.delete(i); }}
                            />
                        );
                    })}
                    {offsets.map(offset => {
                        const i    = center + offset;
                        const game = games[wrap(i, count)];
                        return (
                            <div
                                key={`item-${i}`}
                                className="carousel-item"
                                ref={el => { if (el) items.current.set(i, el); else items.current.delete(i); }}
                                onClick={() => {
                                    // Fin d'un glissé au doigt : pas d'ouverture de la fiche
                                    if (touch.current.dragged) { touch.current.dragged = false; return; }
                                    window.location.href = gameUrl(game);
                                }}
                            >
                                <CoverImage game={game} failed={failed} onFail={markFailed} />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="carousel-title-bar">
                <span className="carousel-game-title">
                    {active.main_title}
                    {active.origin === 'AI_ASSISTED' && (
                        <span className="carousel-ai-badge" title="Jeu réalisé avec l'aide d'une IA">IA</span>
                    )}
                    {machineBadge(active.machine) && (
                        <span className="carousel-machine-badge" title={active.machine_name}>{machineBadge(active.machine)}</span>
                    )}
                </span>
                <span className="carousel-game-sub">{active.release_year}</span>
            </div>

            <div className="carousel-controls">
                <button className="carousel-btn" onClick={() => move(-1)}>◀</button>
                <span className="carousel-counter">{index + 1} / {displayTotal}</span>
                <button className="carousel-btn" onClick={() => move(1)}>▶</button>
            </div>
        </div>
    );
}
