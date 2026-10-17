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
    const filtersRef                    = useRef(filters);
    // Numéro de la dernière demande de suggestions : une réponse plus ancienne est ignorée
    const requestRef                    = useRef(0);

    filtersRef.current = filters;

    // Pending suggestions are dropped when the component unmounts
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    /**
     * Fetches suggestions with debounce for the text being typed. Only typing triggers it:
     * a submitted search (which changes the filters) must not reopen the menu.
     */
    function suggest(text: string) {
        if (timerRef.current) clearTimeout(timerRef.current);
        const request = ++requestRef.current;
        if (text.trim().length < MIN_CHARS) {
            setSuggestions([]);
            setOpen(false);
            return;
        }
        timerRef.current = setTimeout(async () => {
            const results = await fetchSuggestions(text, filtersRef.current).catch(() => []);
            if (request !== requestRef.current) return;
            setSuggestions(results);
            setOpen(results.length > 0);
            setActiveIdx(-1);
        }, DEBOUNCE_MS);
    }

    function submit(term: string) {
        // Annule la demande de suggestions en attente ou en cours
        if (timerRef.current) clearTimeout(timerRef.current);
        requestRef.current++;
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
                    onChange={e => { onChange(e.target.value); suggest(e.target.value); }}
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
