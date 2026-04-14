import { useEffect, useState } from 'react';

interface Props {
    value: number;
}

/** Splits a number into exactly 5 digits, zero-padded. */
function toDigits(n: number): number[] {
    const s = String(Math.min(n, 99999)).padStart(5, '0');
    return s.split('').map(Number);
}

/** Single reel — animates vertically when digit changes. */
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
