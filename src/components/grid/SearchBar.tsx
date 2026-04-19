import { useEffect, useRef, useState } from 'react';
import { fetchSuggestions } from '../../share/models/games';
import type { GameFilters } from '../../share/types/game';
import './SearchBar.css';

interface Props {
    value: string;
    filters: GameFilters;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 180;

export default function SearchBar({ value, filters, onChange, onSubmit }: Props) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [open, setOpen]               = useState(false);
    const [activeIdx, setActiveIdx]     = useState(-1);
    const timerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputRef                      = useRef<HTMLInputElement>(null);

    // Fetch suggestions with debounce whenever input changes
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (value.length < MIN_CHARS) {
            setSuggestions([]);
            setOpen(false);
            return;
        }
        timerRef.current = setTimeout(async () => {
            const results = await fetchSuggestions(value, filters).catch(() => []);
            setSuggestions(results);
            setOpen(results.length > 0);
            setActiveIdx(-1);
        }, DEBOUNCE_MS);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [value, filters]);

    function submit(term: string) {
        setOpen(false);
        setSuggestions([]);
        onSubmit(term);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (!open) {
            if (e.key === 'Enter') submit(value);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx(i => Math.max(i - 1, -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const term = activeIdx >= 0 ? suggestions[activeIdx] : value;
            onChange(term);
            submit(term);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    }

    return (
        <div className="search-bar">
            <div className="search-input-wrap">
                <span className="search-icon">🔍</span>
                <input
                    ref={inputRef}
                    className="search-input"
                    type="text"
                    value={value}
                    placeholder="RECHERCHER UN JEU..."
                    onChange={e => { onChange(e.target.value); }}
                    onKeyDown={handleKeyDown}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
                    autoComplete="off"
                    spellCheck={false}
                />
                {value && (
                    <button className="search-clear" onClick={() => { onChange(''); submit(''); }}>✕</button>
                )}
            </div>
            {open && (
                <ul className="search-dropdown">
                    {suggestions.map((s, i) => (
                        <li
                            key={s}
                            className={`search-suggestion${i === activeIdx ? ' is-active' : ''}`}
                            onMouseDown={() => { onChange(s); submit(s); }}
                            onMouseEnter={() => setActiveIdx(i)}
                        >
                            {s}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
