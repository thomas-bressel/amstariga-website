import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameListItem } from '../../share/types/game';
import './Carousel.css';

/** Radius of the 3-D wheel in pixels — controls how far apart items appear. */
const RADIUS = 480;

/** Angular step in degrees between adjacent carousel slots. */
const STEP   = 30;

/**
 * Slot offsets relative to the active item.
 * Negative = left, positive = right, 0 = centre.
 */
const SLOTS  = [-3, -2, -1, 0, 1, 2, 3];

/** Props for {@link Carousel}. */
interface Props {
    /** Full list of games to cycle through. */
    games: GameListItem[];
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
export default function Carousel({ games }: Props) {
    const [index, setIndex]         = useState(0);
    const [angle, setAngle]         = useState(0);
    const [animating, setAnimating] = useState(false);
    const wheelRef                  = useRef<HTMLDivElement>(null);
    const containerRef              = useRef<HTMLDivElement>(null);
    const touchStartX               = useRef(0);
    const total                     = games.length;

    /**
     * Rotates the carousel by one slot in the given direction.
     *
     * Uses a CSS transition on the wheel element then resets the transform to 0°
     * once the animation ends, so the angle never accumulates.
     *
     * @param direction - `1` to advance (next), `-1` to go back (prev).
     */
    const move = useCallback((direction: number) => {
        if (animating || !total) return;
        setAnimating(true);

        const wheel = wheelRef.current;
        if (!wheel) { setAnimating(false); return; }

        const nextAngle = angle - direction * STEP;
        wheel.style.transition = 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        wheel.style.transform  = `rotateY(${nextAngle}deg)`;

        wheel.addEventListener('transitionend', function handler() {
            wheel.removeEventListener('transitionend', handler);
            wheel.style.transition = 'none';
            setIndex(prev => ((prev + direction) % total + total) % total);
            setAngle(0);
            wheel.style.transform = 'rotateY(0deg)';
            setAnimating(false);
        });
    }, [animating, angle, total]);

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

    if (!total) return null;

    const active = games[index];

    return (
        <div
            ref={containerRef}
            className={`carousel-container${visible ? ' is-visible' : ''}`}
            onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={e => {
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
            }}
        >
            <div className="carousel-scene">
                <div className="carousel-wheel" ref={wheelRef} style={{ transform: `rotateY(${angle}deg)` }}>
                    {SLOTS.map(offset => {
                        const itemAngle = offset * STEP;
                        const abs       = Math.abs(offset);
                        return (
                            <div
                                key={`shadow-${offset}`}
                                className="carousel-shadow"
                                style={{
                                    transform: `rotateY(${itemAngle}deg) translateZ(${RADIUS}px) rotateX(90deg) scaleY(1.8)`,
                                    opacity: abs === 0 ? 0.85 : abs === 1 ? 0.5 : 0.2,
                                }}
                            />
                        );
                    })}
                    {SLOTS.map(offset => {
                        const gameIdx   = ((index + offset) % total + total) % total;
                        const game      = games[gameIdx];
                        const itemAngle = offset * STEP;
                        const abs       = Math.abs(offset);
                        return (
                            <div
                                key={`item-${offset}`}
                                className={`carousel-item${abs === 0 ? ' is-active' : abs === 1 ? ' is-adjacent' : ''}`}
                                style={{
                                    transform: `rotateY(${itemAngle}deg) translateZ(${RADIUS}px)`,
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
                <span className="carousel-counter">{index + 1} / {total}</span>
                <button className="carousel-btn" onClick={() => move(1)}>▶</button>
            </div>
        </div>
    );
}
