import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameListItem } from '../../share/types/game';
import { machineBadge } from '../../share/utils/machines';
import { thumbnailPath } from '../../share/utils/thumbnail';
import './Carousel.css';

/** Angular step in degrees between adjacent carousel slots. */
const STEP = 18;

/** Rotation time of one step, and of each step when several are queued (fast wheel). */
const STEP_MS = 180;
const QUEUED_STEP_MS = 110;

/** Wheel distance (px) for one step: one notch of a mouse wheel, a short swipe on a touchpad. */
const WHEEL_STEP = 100;

/** Returns radius and slot offsets based on viewport width. */
function getLayout(width: number): { radius: number; slots: number[] } {
    if (width >= 1600) return { radius: 900, slots: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] };
    if (width >= 1200) return { radius: 750, slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4] };
    return                     { radius: 600, slots: [-3, -2, -1, 0, 1, 2, 3] };
}

/** Positive modulo: game index of an unbounded carousel position. */
function wrap(position: number, count: number): number {
    return count ? ((position % count) + count) % count : 0;
}

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
 * Navigation:
 * - Mouse wheel and touchpad (passive: false so `preventDefault` works)
 * - Touch swipe (threshold 40 px)
 * - Prev/next buttons
 *
 * Each card is keyed by its unbounded position, not by its slot: when the wheel turns, a card
 * keeps its element and its image, so nothing reloads in the middle of the carousel. Steps asked
 * during a rotation are queued (at most 3), and played faster.
 *
 * Visibility is controlled by `retro:carousel-show` (first visit, fired by the
 * CRT boot sequence) or by reading `amstariga_visited` from localStorage
 * (returning visitors — shown immediately, no animation).
 *
 * @param games - Array of games to display; renders nothing if empty.
 */
export default function Carousel({ games, total, initialIndex = 0, topOffset = 0, listId = 0, onNearEnd }: Props) {
    const startIndex = (count: number) => wrap(initialIndex, count);
    // Position sans fin : le jeu montré est celui de la position modulo le nombre de jeux
    const [position, setPosition]   = useState(() => startIndex(games.length));
    const [shownList, setShownList] = useState(listId);
    // Angle de la roue ; animate : retour à 0° avec une transition
    const [spin, setSpin]           = useState({ angle: 0, animate: false, ms: STEP_MS });
    const [layout, setLayout]       = useState(() => getLayout(1200));
    const wheelRef                  = useRef<HTMLDivElement>(null);
    const containerRef              = useRef<HTMLDivElement>(null);
    const touchStartX               = useRef(0);
    const pending                   = useRef(0);      // crans demandés, pas encore joués
    const turning                   = useRef(false);  // une rotation est en cours
    const fallback                  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const wheelDelta                = useRef({ total: 0, at: 0, direction: 0 });
    const preloaded                 = useRef(new Set<string>());
    const [failed, setFailed]       = useState<Set<string>>(() => new Set());
    const markFailed = useCallback((src: string) => {
        setFailed(prev => (prev.has(src) ? prev : new Set(prev).add(src)));
    }, []);

    useEffect(() => {
        setLayout(getLayout(window.innerWidth));
        const onResize = () => setLayout(getLayout(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const { radius, slots } = layout;
    const count = games.length;
    const index = wrap(position, count);
    const displayTotal = total ?? count;

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
            const src = coverSources(games[wrap(position + offset, count)]).find(s => !failed.has(s));
            if (!src || preloaded.current.has(src)) continue;
            preloaded.current.add(src);
            const img = new Image();
            img.decoding = 'async';
            img.onerror = () => markFailed(src);
            img.src = src;
        }
    }, [position, games, slots, failed]);

    /** Fin d'un cran : le suivant s'il y en a en file. */
    const finishStep = useCallback(() => {
        clearTimeout(fallback.current);
        turning.current = false;
        if (pending.current !== 0) step();
    }, []);

    /**
     * Plays one queued step: positions move by one and the wheel is turned the other way by
     * the same angle (nothing moves on screen), then the wheel comes back to 0° with a
     * transition. Cards change place without changing image.
     */
    const step = useCallback(() => {
        const direction = Math.sign(pending.current);
        if (!direction) return;
        pending.current -= direction;
        turning.current = true;
        setPosition(p => p + direction);
        setSpin({ angle: direction * STEP, animate: false, ms: pending.current !== 0 ? QUEUED_STEP_MS : STEP_MS });
    }, []);

    // Roue tournée d'un cran sans transition : style appliqué (lecture forcée), puis retour
    // à 0° avec transition, avant que le navigateur n'affiche quoi que ce soit
    useLayoutEffect(() => {
        if (spin.animate || spin.angle === 0) return;
        wheelRef.current?.getBoundingClientRect();
        setSpin(s => ({ ...s, angle: 0, animate: true }));
        // Filet de sécurité si transitionend n'arrive pas (onglet en arrière-plan…)
        clearTimeout(fallback.current);
        fallback.current = setTimeout(finishStep, spin.ms + 120);
    }, [spin]);

    useEffect(() => () => clearTimeout(fallback.current), []);

    /**
     * Rotates the carousel by one slot in the given direction, or queues the step if the
     * wheel is turning (at most 3 steps ahead).
     *
     * @param direction - `1` to advance (next), `-1` to go back (prev).
     */
    const move = useCallback((direction: number) => {
        if (!count) return;
        pending.current = Math.max(-3, Math.min(3, pending.current + direction));
        if (!turning.current) step();
    }, [count, step]);

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

    // Attach wheel listener with { passive: false } so preventDefault works.
    // Début d'un geste (encoche de molette, même petite) : un cran tout de suite ; flux continu
    // (pavé tactile, molette rapide) : un cran de plus tous les WHEEL_STEP px défilés
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handler = (e: WheelEvent) => {
            e.preventDefault();
            if (e.deltaY === 0) return;
            const delta = wheelDelta.current;
            const pixels = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 33;
            const direction = Math.sign(pixels);
            const newGesture = e.timeStamp - delta.at > 250 || direction !== delta.direction;
            delta.at = e.timeStamp;
            if (newGesture) {
                // Au moins un cran, un de plus par WHEEL_STEP px (événements regroupés par le navigateur)
                delta.direction = direction;
                delta.total = 0;
                const steps = Math.max(1, Math.floor(Math.abs(pixels) / WHEEL_STEP));
                for (let i = 0; i < steps; ++i) move(direction);
                return;
            }
            delta.total += pixels;
            while (Math.abs(delta.total) >= WHEEL_STEP) {
                const direction = Math.sign(delta.total);
                delta.total -= direction * WHEEL_STEP;
                move(direction);
            }
        };

        container.addEventListener('wheel', handler, { passive: false });
        return () => container.removeEventListener('wheel', handler);
    }, [move]);

    // Nouvelle liste : l'index courant peut ne plus y exister. Rendu abandonné, React le
    // recommence aussitôt avec la nouvelle position.
    if (shownList !== listId) {
        setShownList(listId);
        setPosition(startIndex(count));
        setSpin({ angle: 0, animate: false, ms: STEP_MS });
        pending.current = 0;
        turning.current = false;
        return null;
    }

    if (!count) return null;

    const active = games[index];

    return (
        <div
            ref={containerRef}
            className={`carousel-container${visible ? ' is-visible' : ''}`}
            style={{ paddingTop: topOffset }}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
            }}
        >
            <div className="carousel-scene">
                <div
                    className="carousel-wheel"
                    ref={wheelRef}
                    style={{
                        transform: `rotateY(${spin.angle}deg)`,
                        transition: spin.animate ? `transform ${spin.ms}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` : 'none',
                    }}
                    onTransitionEnd={e => {
                        // Seule la rotation de la roue compte (pas les transitions des cartes)
                        if (e.target === e.currentTarget && e.propertyName === 'transform') finishStep();
                    }}
                >
                    {slots.map(offset => {
                        const itemAngle = offset * STEP;
                        const abs       = Math.abs(offset);
                        return (
                            <div
                                key={`shadow-${offset}`}
                                className="carousel-shadow"
                                style={{
                                    transform: `rotateY(${itemAngle}deg) translateZ(${radius}px) rotateX(90deg) scaleY(1.8)`,
                                    opacity: abs === 0 ? 0.85 : abs === 1 ? 0.5 : 0.2,
                                }}
                            />
                        );
                    })}
                    {slots.map(offset => {
                        const game      = games[wrap(position + offset, count)];
                        const itemAngle = offset * STEP;
                        const abs       = Math.abs(offset);
                        return (
                            <div
                                key={`item-${position + offset}`}
                                className={`carousel-item${abs === 0 ? ' is-active' : abs === 1 ? ' is-adjacent' : ''}`}
                                style={{
                                    transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
                                    opacity: abs === 0 ? 1 : abs === 1 ? 0.75 : abs === 2 ? 0.45 : 0.2,
                                }}
                                onClick={() => { window.location.href = `/game/${game.id}`; }}
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
