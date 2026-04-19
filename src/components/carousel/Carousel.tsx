import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameListItem } from '../../share/types/game';
import './Carousel.css';

/** Angular step in degrees between adjacent carousel slots. */
const STEP = 18;

/** Returns radius and slot offsets based on viewport width. */
function getLayout(width: number): { radius: number; slots: number[] } {
    if (width >= 1600) return { radius: 900, slots: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] };
    if (width >= 1200) return { radius: 750, slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4] };
    return                     { radius: 600, slots: [-3, -2, -1, 0, 1, 2, 3] };
}

/** Props for {@link Carousel}. */
interface Props {
    /** Full list of games to cycle through. */
    games: GameListItem[];
    /** Total number of games (may exceed games.length if not all loaded yet). */
    total?: number;
    /** Index to start at (restored from localStorage). */
    initialIndex?: number;
    /** Top offset in px to avoid collision with the sticky filter bar. */
    topOffset?: number;
    /** Called when the user navigates near the end of loaded games, to trigger a new batch fetch. */
    onNearEnd?: () => void;
}

/**
 * CSS 3-D rotating carousel for the game cover view.
 *
 * Navigation:
 * - Mouse wheel (passive: false so `preventDefault` works)
 * - Touch swipe (threshold 40 px)
 * - Prev/next buttons
 *
 * Visibility is controlled by `retro:carousel-show` (first visit, fired by the
 * CRT boot sequence) or by reading `amstariga_visited` from localStorage
 * (returning visitors — shown immediately, no animation).
 *
 * @param games - Array of games to display; renders nothing if empty.
 */
export default function Carousel({ games, total, initialIndex = 0, topOffset = 0, onNearEnd }: Props) {
    const [index, setIndex]         = useState(() => {
        if (!games.length) return 0;
        return ((initialIndex % games.length) + games.length) % games.length;
    });
    const [angle, setAngle]         = useState(0);
    const [animating, setAnimating] = useState(false);
    const [layout, setLayout]       = useState(() => getLayout(1200));
    const wheelRef                  = useRef<HTMLDivElement>(null);
    const containerRef              = useRef<HTMLDivElement>(null);
    const touchStartX               = useRef(0);

    useEffect(() => {
        setLayout(getLayout(window.innerWidth));
        const onResize = () => setLayout(getLayout(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const { radius, slots } = layout;
    const displayTotal = total ?? games.length;

    // Charge le batch suivant quand on approche les 10 derniers jeux chargés
    useEffect(() => {
        if (onNearEnd && total && index >= games.length - 10 && games.length < total) {
            onNearEnd();
        }
    }, [index]);

    /**
     * Rotates the carousel by one slot in the given direction.
     *
     * Uses a CSS transition on the wheel element then resets the transform to 0°
     * once the animation ends, so the angle never accumulates.
     *
     * @param direction - `1` to advance (next), `-1` to go back (prev).
     */
    const move = useCallback((direction: number) => {
        const count = games.length;
        if (animating || !count) return;
        setAnimating(true);

        const wheel = wheelRef.current;
        if (!wheel) { setAnimating(false); return; }

        const nextAngle = angle - direction * STEP;
        wheel.style.transition = 'transform 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        wheel.style.transform  = `rotateY(${nextAngle}deg)`;

        wheel.addEventListener('transitionend', function handler() {
            wheel.removeEventListener('transitionend', handler);
            wheel.style.transition = 'none';
            const next = ((index + direction) % count + count) % count;
            setIndex(next);
            try { localStorage.setItem('amstariga_carousel_index', String(next)); } catch {}
            setAngle(0);
            wheel.style.transform = 'rotateY(0deg)';
            setAnimating(false);
        });
    }, [animating, angle, games.length]);

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

    // Attach wheel listener with { passive: false } so preventDefault works
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handler = (e: WheelEvent) => {
            e.preventDefault();
            move(e.deltaY > 0 ? 1 : -1);
        };

        container.addEventListener('wheel', handler, { passive: false });
        return () => container.removeEventListener('wheel', handler);
    }, [move]);

    if (!games.length) return null;

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
                <div className="carousel-wheel" ref={wheelRef} style={{ transform: `rotateY(${angle}deg)` }}>
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
                        const count   = games.length;
                        const gameIdx = ((index + offset) % count + count) % count;
                        const game      = games[gameIdx];
                        const itemAngle = offset * STEP;
                        const abs       = Math.abs(offset);
                        return (
                            <div
                                key={`item-${offset}`}
                                className={`carousel-item${abs === 0 ? ' is-active' : abs === 1 ? ' is-adjacent' : ''}`}
                                style={{
                                    transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
                                    opacity: abs === 0 ? 1 : abs === 1 ? 0.75 : abs === 2 ? 0.45 : 0.2,
                                }}
                                onClick={() => { window.location.href = `/game/${game.id}`; }}
                            >
                                <span style={{ fontSize: '5rem', filter: 'drop-shadow(0 0 8px var(--accent))' }}>📦</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="carousel-title-bar">
                <span className="carousel-game-title">{active.main_title}</span>
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
