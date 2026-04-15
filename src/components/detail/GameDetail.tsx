import { useState, useEffect } from 'react';
import type { Game, GameDump, GameAuthor, GameComment } from '../../share/types/game';

interface Props {
    game: Game;
}

/* ── Config des plaques ── */
const PLATE_LAYOUT = [
    { key: 'info',        label: 'SYSTEM_IDENTITY',   size: 'span-2 row-2' },
    { key: 'dump',        label: 'DISK_ARCHIVE',      size: 'span-2'       },
    { key: 'compilation', label: 'COMPILATIONS',      size: 'span-2'       },
    { key: 'compil_d7',   label: 'COMPILATION D7',    size: 'span-2'       },
    { key: 'compil_k7',   label: 'COMPILATION K7',    size: 'span-2'       },
    { key: 'authors',     label: 'PRODUCTION_STAFF',  size: ''             },
    { key: 'tips',        label: 'POKES & ASTUCES',   size: ''             },
    { key: 'bugs',        label: 'BUG_REPORT',        size: ''             },
    { key: 'comments',    label: 'INTERNAL_LOGS',     size: ''             },
];

function isCompilation(game: Game): boolean {
    return (game.categories ?? []).some(c => c.toUpperCase() === 'COMPILATION');
}

function splitDumps(game: Game): { direct: GameDump[]; compilation: GameDump[] } {
    const direct:      GameDump[] = [];
    const compilation: GameDump[] = [];
    for (const d of game.dumps ?? []) {
        if (d.file_name.includes('[COMPILATION]')) compilation.push(d);
        else                                       direct.push(d);
    }
    return { direct, compilation };
}

/** Extrait les titres de jeux uniques depuis les file_name K7 (pattern "(N. Titre)") */
function extractK7Games(dumps: GameDump[]): string[] {
    const seen = new Set<string>();
    for (const d of dumps) {
        const m = d.file_name.match(/\((\d+\.\s*[^)]+?)\)\s*\[/);
        if (m) {
            const title = m[1].replace(/^\d+\.\s*/, '').split(' - ')[0].trim();
            seen.add(title);
        }
    }
    return [...seen];
}

function hasData(key: string, game: Game): boolean {
    if (key === 'info')        return true;
    // plaques jeu normal
    if (key === 'dump')        return !isCompilation(game) && splitDumps(game).direct.length > 0;
    if (key === 'compilation') return !isCompilation(game) && splitDumps(game).compilation.length > 0;
    // plaques compilation
    if (key === 'compil_d7')   return isCompilation(game) && (game.dumps ?? []).some(d => d.category.startsWith('D7'));
    if (key === 'compil_k7')   return isCompilation(game) && (game.dumps ?? []).some(d => d.category.startsWith('K7'));
    if (key === 'authors')     return (game.authors?.length  ?? 0) > 0;
    if (key === 'tips')        return (game.tips?.length     ?? 0) > 0;
    if (key === 'bugs')        return (game.bugs?.length     ?? 0) > 0;
    if (key === 'comments')    return (game.comments?.length ?? 0) > 0;
    return false;
}

/* ── Aperçu court dans la plaque ── */
function PlatePreview({ plateKey, game }: { plateKey: string; game: Game }) {
    if (plateKey === 'info') {
        return (
            <>
                <h2 className="plate-title">{game.main_title}</h2>
                <p className="plate-meta">
                    {game.release_year ?? '????'} · {game.editor ?? '???'}
                </p>
                {(game.categories?.length ?? 0) > 0 && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {[...game.categories!]
                            .sort((a, b) => {
                                const aParent = a === a.toUpperCase();
                                const bParent = b === b.toUpperCase();
                                if (aParent && !bParent) return -1;
                                if (!aParent && bParent) return 1;
                                return 0;
                            })
                            .map((c, i) => (
                                <span key={i} className="hero-tag hero-tag--on" style={{ fontSize: '0.55rem' }}>{c}</span>
                            ))}
                    </div>
                )}
            </>
        );
    }
    if (plateKey === 'dump') {
        const { direct } = splitDumps(game);
        const types = [...new Set(direct.map(d => d.category))].join(' · ');
        return <div className="plate-empty">{types} — {direct.length} fichier(s)</div>;
    }
    if (plateKey === 'compilation') {
        const { compilation } = splitDumps(game);
        const names = [...new Set(compilation.map(d => d.file_name.split('(')[0].trim()))];
        return <div className="plate-empty">{names.length} compilation(s) : {names.join(', ')}</div>;
    }
    if (plateKey === 'compil_d7') {
        const d7 = (game.dumps ?? []).filter(d => d.category.startsWith('D7'));
        return <div className="plate-empty">{d7.length} face(s) disquette</div>;
    }
    if (plateKey === 'compil_k7') {
        const k7 = (game.dumps ?? []).filter(d => d.category.startsWith('K7'));
        const titles = extractK7Games(k7);
        const label  = titles.length > 0
            ? `${titles.length} jeu(x) · ${k7.length} face(s) cassette`
            : `${k7.length} face(s) cassette`;
        return <div className="plate-empty">{label}</div>;
    }
    if (plateKey === 'authors' && game.authors?.[0]) {
        return <div className="plate-empty">{game.authors[0].role} : {game.authors[0].name}</div>;
    }
    return <div className="plate-empty">SECTOR_{plateKey.toUpperCase()}_ACTIVE</div>;
}

/* ── Modale compilations avec résolution des IDs ── */
function CompilationModal({ game }: { game: Game }) {
    const { compilation } = splitDumps(game);

    // Regrouper par nom de compilation
    const groups: Record<string, { categories: Set<string>; command?: string }> = {};
    for (const d of compilation) {
        const name = d.file_name.split('(')[0].trim();
        if (!groups[name]) groups[name] = { categories: new Set() };
        groups[name].categories.add(d.category);
        if (!groups[name].command && d.loading_command) groups[name].command = d.loading_command;
    }

    const names = Object.keys(groups);
    const [ids, setIds] = useState<Record<string, number | null>>({});

    useEffect(() => {
        const apiBase = (typeof window !== 'undefined' ? (window as any).__PUBLIC_API_URL__ : '') ?? '';
        names.forEach(async name => {
            try {
                const res  = await fetch(`/api/games?search=${encodeURIComponent(name)}&limit=1`);
                const data = await res.json() as Array<{ id: number; main_title: string }>;
                const match = data.find(g => g.main_title.toLowerCase() === name.toLowerCase());
                setIds(prev => ({ ...prev, [name]: match?.id ?? null }));
            } catch {
                setIds(prev => ({ ...prev, [name]: null }));
            }
        });
    }, []);

    return (
        <>
            <h2 className="modal-section-title">COMPILATIONS</h2>
            {names.map(name => {
                const info = groups[name];
                const id   = ids[name];
                return (
                    <div key={name} className="dump-block">
                        <h3 className="dump-label">
                            {id != null
                                ? <a href={`/game/${id}`} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px' }}>{name} →</a>
                                : name
                            }
                        </h3>
                        <p>SUPPORT : {[...info.categories].join(' · ')}</p>
                        {info.command && <p>COMMANDE : <code>{info.command}</code></p>}
                    </div>
                );
            })}
        </>
    );
}

/* ── Modale D7 d'une compilation : liste des fichiers (faces) ── */
function CompilD7Modal({ game }: { game: Game }) {
    const dumps   = (game.dumps ?? []).filter(d => d.category.startsWith('D7'));
    const command = dumps.find(d => d.loading_command)?.loading_command;
    // Regrouper par category (D7ORI, D7CRACK…)
    const groups: Record<string, GameDump[]> = {};
    for (const d of dumps) {
        if (!groups[d.category]) groups[d.category] = [];
        groups[d.category].push(d);
    }
    return (
        <>
            <h2 className="modal-section-title">COMPILATION D7</h2>
            {command && <p style={{ marginBottom: '1.5rem' }}>COMMANDE : <code>{command}</code></p>}
            {Object.entries(groups).map(([cat, items]) => (
                <div key={cat} className="dump-block">
                    <h3 className="dump-label">{cat}</h3>
                    {items.map((d, i) => (
                        <p key={i} style={{ marginBottom: '4px' }}>FILE : {d.file_name}</p>
                    ))}
                </div>
            ))}
        </>
    );
}

/* ── Modale K7 d'une compilation : jeux extraits + liens ── */
function CompilK7Modal({ game }: { game: Game }) {
    const dumps   = (game.dumps ?? []).filter(d => d.category.startsWith('K7'));
    const command = dumps.find(d => d.loading_command)?.loading_command;
    const titles  = extractK7Games(dumps);
    const [ids, setIds] = useState<Record<string, number | null>>({});

    useEffect(() => {
        titles.forEach(async title => {
            try {
                const res   = await fetch(`/api/games?search=${encodeURIComponent(title)}&limit=1`);
                const data  = await res.json() as Array<{ id: number; main_title: string }>;
                const match = data.find(g => g.main_title.toLowerCase() === title.toLowerCase());
                setIds(prev => ({ ...prev, [title]: match?.id ?? null }));
            } catch {
                setIds(prev => ({ ...prev, [title]: null }));
            }
        });
    }, []);

    // Si pas de titres extractibles, afficher les fichiers bruts
    if (titles.length === 0) {
        const groups: Record<string, GameDump[]> = {};
        for (const d of dumps) {
            if (!groups[d.category]) groups[d.category] = [];
            groups[d.category].push(d);
        }
        return (
            <>
                <h2 className="modal-section-title">COMPILATION K7</h2>
                {command && <p style={{ marginBottom: '1.5rem' }}>COMMANDE : <code>{command}</code></p>}
                {Object.entries(groups).map(([cat, items]) => (
                    <div key={cat} className="dump-block">
                        <h3 className="dump-label">{cat}</h3>
                        {items.map((d, i) => (
                            <p key={i} style={{ marginBottom: '4px' }}>FILE : {d.file_name}</p>
                        ))}
                    </div>
                ))}
            </>
        );
    }

    return (
        <>
            <h2 className="modal-section-title">COMPILATION K7</h2>
            {command && <p style={{ marginBottom: '1.5rem' }}>COMMANDE : <code>{command}</code></p>}
            <div className="dump-block">
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {titles.map((title, i) => {
                        const id = ids[title];
                        return (
                            <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                {id != null
                                    ? <a href={`/game/${id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>→ {title}</a>
                                    : <span style={{ color: 'var(--text-dim)' }}>· {title}</span>
                                }
                            </li>
                        );
                    })}
                </ul>
            </div>
        </>
    );
}

/* ── Contenu complet dans la modale ── */
function ModalContent({ plateKey, game }: { plateKey: string; game: Game }) {
    if (plateKey === 'info') {
        const cats = game.categories?.join(', ') ?? '—';
        return (
            <>
                <h1 className="modal-game-title">{game.main_title}</h1>
                {game.alt_title && <p className="modal-alt-title">{game.alt_title}</p>}
                {game.synopsis  && <p className="modal-synopsis">{game.synopsis}</p>}
                <hr className="modal-sep" />
                <h3 className="modal-sub-title">RELEASE_INFO</h3>
                <p><strong>ANNÉE :</strong> {game.release_year ?? '????'}</p>
                <p><strong>ÉDITEUR :</strong> {game.editor ?? '???'}</p>
                <p><strong>CATÉGORIE :</strong> {(() => {
                    const parent = game.categories?.find(c => c === c.toUpperCase());
                    const children = game.categories?.filter(c => c !== c.toUpperCase()) ?? [];
                    if (!parent) return cats;
                    if (children.length === 0) return parent;
                    return `${parent} de type ${children.join(', ')}`;
                })()}</p>
                <p><strong>JOUEURS :</strong> {
                    game.players_min === game.players_max
                        ? `${game.players_min} joueur${(game.players_min ?? 1) > 1 ? 's' : ''}`
                        : `${game.players_min} à ${game.players_max} joueurs`
                }</p>
                {game.rating && <p><strong>NOTE :</strong> {game.rating}/10</p>}
                {game.notes && <p className="comment-quote" style={{ marginTop: '1.5rem' }}>{game.notes}</p>}
            </>
        );
    }

    if (plateKey === 'dump') {
        const { direct } = splitDumps(game);
        const groups: Record<string, GameDump[]> = {};
        for (const d of direct) {
            if (!groups[d.category]) groups[d.category] = [];
            groups[d.category].push(d);
        }
        return (
            <>
                <h2 className="modal-section-title">DISK_DUMP_REPORT</h2>
                {Object.entries(groups).map(([category, items]) => (
                    <div key={category} className="dump-block">
                        <h3 className="dump-label">{category}</h3>
                        {items.map((d, i) => (
                            <div key={i} style={{ marginBottom: i < items.length - 1 ? '0.75rem' : 0 }}>
                                <p>FILE : {d.file_name}</p>
                                {d.loading_command && <p>COMMANDE : <code>{d.loading_command}</code></p>}
                                {d.protection      && <p>PROTECTION : {d.protection}</p>}
                            </div>
                        ))}
                    </div>
                ))}
            </>
        );
    }

    if (plateKey === 'compilation') {
        return <CompilationModal game={game} />;
    }
    if (plateKey === 'compil_d7') {
        return <CompilD7Modal game={game} />;
    }
    if (plateKey === 'compil_k7') {
        return <CompilK7Modal game={game} />;
    }

    if (plateKey === 'authors') {
        return (
            <>
                <h2 className="modal-section-title">PRODUCTION_STAFF</h2>
                <ul>
                    {(game.authors ?? []).map((a: GameAuthor, i: number) => (
                        <li key={i}><strong>{a.role} :</strong> {a.name}</li>
                    ))}
                </ul>
            </>
        );
    }

    if (plateKey === 'tips') {
        return (
            <>
                <h2 className="modal-section-title">POKES & ASTUCES</h2>
                <ul>{(game.tips ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
        );
    }

    if (plateKey === 'bugs') {
        return (
            <>
                <h2 className="modal-section-title">BUG_REPORT</h2>
                <ul className="bug-list">
                    {(game.bugs ?? []).map((b, i) => <li key={i}>⚠ {b}</li>)}
                </ul>
            </>
        );
    }

    if (plateKey === 'comments') {
        return (
            <>
                <h2 className="modal-section-title">INTERNAL_LOGS</h2>
                {(game.comments ?? []).map((c: GameComment, i: number) => (
                    <div key={i} className="dump-block">
                        {c.author  && <p><strong>{c.author}</strong></p>}
                        {c.content && <p className="comment-quote">{c.content}</p>}
                    </div>
                ))}
            </>
        );
    }

    return <p className="empty-sector">SECTOR_DATA_EMPTY</p>;
}

/* ── Composant principal ── */
export default function GameDetail({ game }: Props) {
    const [activeKey, setActiveKey] = useState<string | null>(null);

    const systemId = 'ID_' + String(game.id).padStart(4, '0');
    const yearStr  = game.release_year ? String(game.release_year) : '????';
    const edStr    = game.editor ?? '???';
    const catStr   = game.categories?.length ? ' · ' + game.categories[0] : '';
    const sub      = `${yearStr} — ${edStr}${catStr}`;

    const boolMap: Record<string, boolean> = {
        DUMP:     (game.dumps?.length    ?? 0) > 0,
        TIPS:     (game.tips?.length     ?? 0) > 0,
        BUGS:     (game.bugs?.length     ?? 0) > 0,
        COMMENTS: (game.comments?.length ?? 0) > 0,
        AUTHORS:  (game.authors?.length  ?? 0) > 0,
    };

    const activePlates = PLATE_LAYOUT.filter(p => hasData(p.key, game));
    const activeLabel  = PLATE_LAYOUT.find(p => p.key === activeKey)?.label ?? '';

    function closeModal() {
        setActiveKey(null);
        document.body.style.overflow = '';
    }

    function openModal(key: string) {
        setActiveKey(key);
        document.body.style.overflow = 'hidden';
    }

    return (
        <>
            {/* ── HERO ── */}
            <div className="game-hero" id="game-hero">
                <div className="game-hero-inner">
                    <div className="game-hero-cover">
                        <span>📦</span>
                    </div>
                    <div className="game-hero-meta">
                        <div className="hero-system-id">{systemId}</div>
                        <h1 className="hero-title">{game.main_title}</h1>
                        <p className="hero-sub">{sub}</p>
                        <div className="hero-tags">
                            {Object.entries(boolMap).map(([k, on]) => (
                                <span key={k} className={`hero-tag${on ? ' hero-tag--on' : ''}`}>
                                    {k}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── BENTO ── */}
            <main className="detail-main">
                <div className="bento-puzzle">
                    {activePlates.map(p => (
                        <div
                            key={p.key}
                            className={`metal-plate ${p.size}`}
                            onClick={() => openModal(p.key)}
                        >
                            <div className="plate-label">{p.label}</div>
                            <div className="plate-content">
                                <PlatePreview plateKey={p.key} game={game} />
                            </div>
                            <div className="read-more-indicator">ACCESS DATA »</div>
                        </div>
                    ))}
                </div>
            </main>

            {/* ── MODALE ── */}
            <div
                className={`puzzle-overlay${activeKey ? ' active' : ''}`}
                onClick={closeModal}
            />
            <div className={`puzzle-modal${activeKey ? ' active' : ''}`}>
                <div className="modal-header">
                    <span className="modal-sys-title">
                        SECTOR :: {activeLabel}
                    </span>
                    <button className="modal-close-btn" onClick={closeModal}>
                        [×] FERMER
                    </button>
                </div>
                <div className="modal-body">
                    {activeKey && <ModalContent plateKey={activeKey} game={game} />}
                </div>
            </div>
        </>
    );
}
