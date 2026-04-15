import { useState } from 'react';
import type { Game, GameDump, GameAuthor, GameComment } from '../../share/types/game';

interface Props {
    game: Game;
}

/* ── Config des plaques ── */
const PLATE_LAYOUT = [
    { key: 'info',     label: 'SYSTEM_IDENTITY',  size: 'span-2 row-2' },
    { key: 'dump',     label: 'DISK_ARCHIVE',     size: 'span-2'       },
    { key: 'authors',  label: 'PRODUCTION_STAFF', size: ''             },
    { key: 'tips',     label: 'TIPS_SHORTCUTS',   size: ''             },
    { key: 'bugs',     label: 'BUG_REPORT',       size: ''             },
    { key: 'comments', label: 'INTERNAL_LOGS',    size: ''             },
];

function hasData(key: string, game: Game): boolean {
    if (key === 'info')     return true;
    if (key === 'dump')     return (game.dumps?.length    ?? 0) > 0;
    if (key === 'authors')  return (game.authors?.length  ?? 0) > 0;
    if (key === 'tips')     return (game.tips?.length     ?? 0) > 0;
    if (key === 'bugs')     return (game.bugs?.length     ?? 0) > 0;
    if (key === 'comments') return (game.comments?.length ?? 0) > 0;
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
    if (plateKey === 'dump' && game.dumps?.[0]) {
        return <div className="plate-empty">{game.dumps[0].category} — {game.dumps.length} dump(s)</div>;
    }
    if (plateKey === 'categories' && game.categories) {
        return <div className="plate-empty">{game.categories.join(' / ')}</div>;
    }
    if (plateKey === 'authors' && game.authors?.[0]) {
        return <div className="plate-empty">{game.authors[0].role} : {game.authors[0].name}</div>;
    }
    return <div className="plate-empty">SECTOR_{plateKey.toUpperCase()}_ACTIVE</div>;
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
                <p><strong>CATÉGORIE :</strong> {cats}</p>
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
        return (
            <>
                <h2 className="modal-section-title">DISK_DUMP_REPORT</h2>
                {(game.dumps ?? []).map((d: GameDump, i: number) => (
                    <div key={i} className="dump-block">
                        <h3 className="dump-label">{d.category}</h3>
                        {d.file_crc
                            ? <p>CRC : <strong className="accent">{d.file_crc}</strong> &nbsp;|&nbsp; FILE : {d.file_name}</p>
                            : <p>FILE : {d.file_name}</p>
                        }
                        {d.loading_command && <p>BOOT : <code>{d.loading_command}</code></p>}
                        {d.status         && <p>STATUS : {d.status}</p>}
                        {d.protection     && <p className="dump-note">PROTECTION : {d.protection}</p>}
                        {d.comment        && <p className="dump-note">{d.comment}</p>}
                    </div>
                ))}
            </>
        );
    }

    if (plateKey === 'categories') {
        return (
            <>
                <h2 className="modal-section-title">CATEGORIES</h2>
                <ul>{(game.categories ?? []).map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
        );
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
                <h2 className="modal-section-title">TIPS_SHORTCUTS</h2>
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
