import { useEffect, useState } from 'react';

/** Props for {@link TapeCounter}. */
interface Props {
    /** Initial game count to display (updated at runtime via `retro:count-update`). */
    value: number;
}

/**
 * Splits a non-negative integer into exactly 5 digits, zero-padded on the left.
 * Values above 99 999 are clamped to 99 999.
 *
 * @param n - The number to split.
 * @returns   Array of 5 single digits, most-significant first.
 */
function toDigits(n: number): number[] {
    const s = String(Math.min(n, 99999)).padStart(5, '0');
    return s.split('').map(Number);
}

/**
 * Single mechanical reel that animates vertically when its digit changes.
 *
 * @param digit - The digit (0–9) this reel should currently display.
 */
function Reel({ digit }: { digit: number }) {
    const [current, setCurrent]   = useState(digit);
    const [previous, setPrevious] = useState(digit);
    const [rolling, setRolling]   = useState(false);

    useEffect(() => {
        if (digit === current) return;
        setPrevious(current);
        setCurrent(digit);
        setRolling(true);
        const t = setTimeout(() => setRolling(false), 300);
        return () => clearTimeout(t);
    }, [digit]);

    return (
        <div className="tc-reel">
            <div
                className={`tc-strip ${rolling ? 'tc-strip--roll' : ''}`}
                style={{ transform: rolling ? undefined : 'translateY(-50%)' }}
            >
                <span className="tc-digit">{previous}</span>
                <span className="tc-digit">{current}</span>
            </div>
            <div className="tc-reel-shadow tc-reel-shadow--top" />
            <div className="tc-reel-shadow tc-reel-shadow--bot" />
        </div>
    );
}

/**
 * Five-digit mechanical tape counter inspired by Amstrad cassette decks.
 *
 * Listens to the `retro:count-update` custom event dispatched by {@link GameGrid}
 * and animates each reel independently when the corresponding digit changes.
 *
 * @param initialValue - Game count pre-rendered by SSR; updated at runtime via event.
 */
export default function TapeCounter({ value: initialValue }: Props) {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        const handler = (e: Event) => {
            setValue((e as CustomEvent<{ count: number }>).detail.count);
        };
        window.addEventListener('retro:count-update', handler);
        return () => window.removeEventListener('retro:count-update', handler);
    }, []);

    const digits = toDigits(value);

    return (
        <div className="tape-counter" aria-label={`${value} jeux`}>
            {digits.map((d, i) => (
                <Reel key={i} digit={d} />
            ))}
            <span className="tc-label">JEUX</span>
        </div>
    );
}
