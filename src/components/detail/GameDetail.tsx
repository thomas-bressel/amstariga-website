import { Fragment, useCallback, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fetchGames } from '../../share/models/games';
import type { Game, GameDump, GameAuthor, GameComment, GameFile } from '../../share/types/game';

interface Props {
    game: Game;
}

/* ── Config des plaques : code d'ambiance (décoratif) et titre en clair ── */
const PLATE_LAYOUT = [
    { key: 'info',        code: 'SYSTEM_IDENTITY',  title: 'Fiche du jeu',                  size: 'span-2 row-2' },
    { key: 'dump',        code: 'DISK_ARCHIVE',     title: 'Fichiers du jeu',               size: 'span-2'       },
    { key: 'scans',       code: 'PACKAGING_SCANS',  title: 'Boîte et support',              size: 'span-2'       },
    { key: 'manual',      code: 'MANUAL_FILE',      title: 'Manuel',                        size: ''             },
    { key: 'compilation', code: 'COMPILATIONS',     title: 'Présent dans les compilations', size: 'span-2'       },
    { key: 'compil_d7',   code: 'COMPILATION D7',   title: 'Disquettes de la compilation',  size: 'span-2'       },
    { key: 'compil_k7',   code: 'COMPILATION K7',   title: 'Cassettes de la compilation',   size: 'span-2'       },
    { key: 'authors',     code: 'PRODUCTION_STAFF', title: 'Équipe',                        size: ''             },
    { key: 'tips',        code: 'POKES & ASTUCES',  title: 'Astuces',                       size: ''             },
    { key: 'bugs',        code: 'BUG_REPORT',       title: 'Bugs connus',                   size: ''             },
    { key: 'comments',    code: 'INTERNAL_LOGS',    title: 'Commentaires',                  size: ''             },
];

/** Éléments montrés dans l'aperçu d'une plaque, avant « Tout voir » */
const PREVIEW_ITEMS = 3;

const NEW_TAB = ' (s’ouvre dans un nouvel onglet)';

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

/** Libellés des scans classés dans le backoffice */
const SCAN_TYPES: Record<string, string> = {
    cover_front: 'Face avant',
    cover_back:  'Face arrière',
    media:       'Support',
    inlay:       'Jaquette ou encart',
};

/** Dumps propres au jeu (une compilation montre les siens dans ses plaques D7 / K7) */
function ownDumps(game: Game): GameDump[] {
    return isCompilation(game) ? [] : splitDumps(game).direct;
}

/** Fichiers des releases présents sur le serveur sans dump correspondant dans la base */
function otherReleaseFiles(game: Game): GameFile[] {
    const linked = new Set((game.dumps ?? []).map(d => d.url).filter(Boolean));
    return (game.files?.releases ?? []).filter(f => !linked.has(f.url));
}

/** Taille lisible : 512 Ko, 1,3 Mo */
function formatSize(bytes: number): string {
    if (bytes < 1024)        return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** 1 fichier, 3 fichiers */
function plural(count: number, one: string, many: string): string {
    return `${count} ${count > 1 ? many : one}`;
}

function yearLabel(game: Game): string {
    return game.release_year ? String(game.release_year) : 'Année inconnue';
}

function editorLabel(game: Game): string {
    return game.editor ?? 'Éditeur inconnu';
}

function playersLabel(game: Game): string {
    return game.players_min === game.players_max
        ? plural(game.players_min ?? 1, 'joueur', 'joueurs')
        : `${game.players_min} à ${game.players_max} joueurs`;
}

/** Catégorie parente d'abord (en capitales), puis les sous-catégories */
function sortedCategories(game: Game): string[] {
    return [...(game.categories ?? [])].sort((a, b) => {
        const aParent = a === a.toUpperCase();
        const bParent = b === b.toUpperCase();
        if (aParent && !bParent) return -1;
        if (!aParent && bParent) return 1;
        return 0;
    });
}

/** Texte dont les adresses web deviennent des liens */
function Linkified({ text }: { text: string }) {
    const parts = text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g);
    return (
        <>
            {parts.map((part, i) => (i % 2 === 1
                ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}<span className="sr-only">{NEW_TAB}</span></a>
                : <Fragment key={i}>{part}</Fragment>))}
        </>
    );
}

/** Ligne d'un fichier, avec son lien de téléchargement quand il est sur le serveur
 *  (viewable : lien « ouvrir » en plus, pour un manuel lisible dans le navigateur).
 *  Le nom du fichier fait partie du nom des liens : chaque lien se comprend seul. */
function FileLine({ name, url, size, viewable }: { name: string; url?: string; size?: number; viewable?: boolean }) {
    return (
        <p className="file-line">
            <span className="file-name">Fichier : {name}</span>
            {url && viewable && (
                <a className="file-download" href={url} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">⧉ </span>OUVRIR<span className="sr-only"> {name}{NEW_TAB}</span>
                </a>
            )}
            {url && (
                <a className="file-download" href={url} download={name}>
                    <span aria-hidden="true">⇩ </span>TÉLÉCHARGER<span className="sr-only"> {name}</span>
                    {size != null && <span className="file-size"> · {formatSize(size)}</span>}
                </a>
            )}
        </p>
    );
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
    if (key === 'dump')        return ownDumps(game).length > 0 || otherReleaseFiles(game).length > 0;
    if (key === 'scans')       return (game.files?.scans?.length   ?? 0) > 0;
    if (key === 'manual')      return (game.files?.manuals?.length ?? 0) > 0;
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

/** Liste courte d'une plaque, avec le nombre d'éléments en plus */
function PreviewList({ items, more }: { items: ReactNode[]; more: number }) {
    return (
        <>
            <ul className="plate-list">
                {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
            {more > 0 && <p className="plate-more">+ {more} de plus</p>}
        </>
    );
}

/* ── Aperçu dans la plaque : une partie du contenu, lisible sans ouvrir ── */
function PlatePreview({ plateKey, game }: { plateKey: string; game: Game }) {
    if (plateKey === 'info') {
        return (
            <>
                <p className="plate-title">{game.main_title}</p>
                <p className="plate-meta">{yearLabel(game)} · {editorLabel(game)} · {playersLabel(game)}</p>
                {(game.categories?.length ?? 0) > 0 && (
                    <ul className="plate-tags" aria-label="Catégories">
                        {sortedCategories(game).map((c, i) => <li key={i} className="hero-tag hero-tag--on">{c}</li>)}
                    </ul>
                )}
                {(game.synopsis || game.notes) && <p className="plate-excerpt">{game.synopsis || game.notes}</p>}
            </>
        );
    }
    if (plateKey === 'dump') {
        const dumps  = ownDumps(game);
        const others = otherReleaseFiles(game);
        const lines  = [
            ...dumps.map(d => ({ label: d.category, name: d.file_name, url: d.url, size: d.size })),
            ...others.map(f => ({ label: 'Fichier', name: f.name, url: f.url, size: f.size })),
        ];
        const downloads = lines.filter(l => l.url).length;
        return (
            <>
                <p className="plate-meta">
                    {plural(lines.length, 'fichier', 'fichiers')}
                    {downloads > 0 && ` · ${plural(downloads, 'téléchargeable', 'téléchargeables')}`}
                </p>
                <PreviewList
                    items={lines.slice(0, PREVIEW_ITEMS).map(l => (
                        <>
                            <span className="plate-key">{l.label}</span> {l.name}
                            {l.size != null && <span className="plate-dim"> · {formatSize(l.size)}</span>}
                        </>
                    ))}
                    more={lines.length - PREVIEW_ITEMS}
                />
            </>
        );
    }
    if (plateKey === 'scans') {
        const scans = game.files?.scans ?? [];
        return (
            <>
                <p className="plate-meta">{plural(scans.length, 'scan', 'scans')}</p>
                <div className="scan-strip">
                    {scans.slice(0, 4).map(s => (
                        <img key={s.url} src={s.url} alt={`${s.type ? SCAN_TYPES[s.type] ?? s.type : 'Scan'} : ${s.name}`} loading="lazy" />
                    ))}
                </div>
            </>
        );
    }
    if (plateKey === 'manual') {
        const manuals = game.files?.manuals ?? [];
        return (
            <PreviewList
                items={manuals.slice(0, PREVIEW_ITEMS).map(m => <>{m.name}<span className="plate-dim"> · {formatSize(m.size)}</span></>)}
                more={manuals.length - PREVIEW_ITEMS}
            />
        );
    }
    if (plateKey === 'compilation') {
        const { compilation } = splitDumps(game);
        const names = [...new Set(compilation.map(d => d.file_name.split('(')[0].trim()))];
        return <PreviewList items={names.slice(0, PREVIEW_ITEMS)} more={names.length - PREVIEW_ITEMS} />;
    }
    if (plateKey === 'compil_d7' || plateKey === 'compil_k7') {
        const support = plateKey === 'compil_d7' ? 'D7' : 'K7';
        const dumps   = (game.dumps ?? []).filter(d => d.category.startsWith(support));
        const members = (game.compilation_games ?? []).map(m => m.title);
        const titles  = members.length > 0 ? members : support === 'K7' ? extractK7Games(dumps) : [];
        return (
            <>
                <p className="plate-meta">
                    {support === 'D7' ? plural(dumps.length, 'face de disquette', 'faces de disquette')
                                      : plural(dumps.length, 'face de cassette', 'faces de cassette')}
                    {titles.length > 0 && ` · ${plural(titles.length, 'jeu', 'jeux')}`}
                </p>
                <PreviewList items={titles.slice(0, PREVIEW_ITEMS)} more={titles.length - PREVIEW_ITEMS} />
            </>
        );
    }
    if (plateKey === 'authors') {
        const authors = game.authors ?? [];
        return (
            <PreviewList
                items={authors.slice(0, PREVIEW_ITEMS).map(a => <><span className="plate-key">{a.role} :</span> {a.name}</>)}
                more={authors.length - PREVIEW_ITEMS}
            />
        );
    }
    if (plateKey === 'tips' || plateKey === 'bugs') {
        const items = (plateKey === 'tips' ? game.tips : game.bugs) ?? [];
        return (
            <>
                <p className="plate-excerpt plate-excerpt--short">{items[0]}</p>
                {items.length > 1 && <p className="plate-more">+ {items.length - 1} de plus</p>}
            </>
        );
    }
    if (plateKey === 'comments') {
        const comments = game.comments ?? [];
        const first    = comments[0];
        return (
            <>
                {first?.author && <p className="plate-key">{first.author}</p>}
                {first?.content && <p className="plate-excerpt plate-excerpt--short">{first.content}</p>}
                {comments.length > 1 && <p className="plate-more">+ {comments.length - 1} de plus</p>}
            </>
        );
    }
    return null;
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
        names.forEach(async name => {
            try {
                const data  = await fetchGames({ search: name }, 1);
                const match = data.find(g => g.main_title.toLowerCase() === name.toLowerCase());
                setIds(prev => ({ ...prev, [name]: match?.id ?? null }));
            } catch {
                setIds(prev => ({ ...prev, [name]: null }));
            }
        });
    }, []);

    return (
        <>
            {names.map(name => {
                const info = groups[name];
                const id   = ids[name];
                return (
                    <div key={name} className="dump-block">
                        <h3 className="dump-label">
                            {id != null ? <a href={`/game/${id}`}>{name} →</a> : name}
                        </h3>
                        <p>Support : {[...info.categories].join(' · ')}</p>
                        {info.command && <p>Commande : <code>{info.command}</code></p>}
                    </div>
                );
            })}
        </>
    );
}

/* ── Modale D7 / K7 d'une compilation : fichiers regroupés par jeu membre ── */
function CompilSupportModal({ game, support }: { game: Game; support: 'D7' | 'K7' }) {
    const dumps   = (game.dumps ?? []).filter(d => d.category.startsWith(support));
    const command = dumps.find(d => d.loading_command)?.loading_command;
    const members = game.compilation_games ?? [];

    // D7 : « Face 1A » → jeu 1 ; K7 : « (1. Cabal) » → jeu 1
    function memberNumber(filename: string): number {
        const m = support === 'D7' ? filename.match(/Face\s+(\d+)/i) : filename.match(/\((\d+)\./);
        return m ? parseInt(m[1]) : 0;
    }

    const byMember: Record<number, GameDump[]> = {};
    const unmatched: GameDump[] = [];
    for (const d of dumps) {
        const n = memberNumber(d.file_name);
        if (n > 0) {
            if (!byMember[n]) byMember[n] = [];
            byMember[n].push(d);
        } else {
            unmatched.push(d);
        }
    }

    const commandLine = command && <p className="modal-command">Commande : <code>{command}</code></p>;

    // Membres connus et faces numérotées : affichage groupé par jeu
    if (members.length > 0 && Object.keys(byMember).length > 0) {
        return (
            <>
                {commandLine}
                {members.map((m, i) => (
                    <div key={m.id} className="dump-block">
                        <h3 className="dump-label"><a href={`/game/${m.id}`}>{m.title} →</a></h3>
                        {(byMember[i + 1] ?? []).map((d, j) => (
                            <FileLine key={j} name={d.file_name} url={d.url} size={d.size} />
                        ))}
                    </div>
                ))}
                {unmatched.map((d, i) => (
                    <FileLine key={i} name={d.file_name} url={d.url} size={d.size} />
                ))}
            </>
        );
    }

    // Sinon : liste brute
    return (
        <>
            {commandLine}
            <div className="dump-block">
                {dumps.map((d, i) => (
                    <FileLine key={i} name={d.file_name} url={d.url} size={d.size} />
                ))}
            </div>
        </>
    );
}

/* ── Contenu complet dans la modale ── */
function ModalContent({ plateKey, game }: { plateKey: string; game: Game }) {
    if (plateKey === 'info') {
        const cats = game.categories?.join(', ') ?? '—';
        const parent   = game.categories?.find(c => c === c.toUpperCase());
        const children = game.categories?.filter(c => c !== c.toUpperCase()) ?? [];
        const category = !parent ? cats : children.length === 0 ? parent : `${parent} de type ${children.join(', ')}`;
        return (
            <>
                <h3 className="modal-game-title">{game.main_title}</h3>
                {game.alt_title && <p className="modal-alt-title">{game.alt_title}</p>}
                {game.synopsis  && <p className="modal-synopsis">{game.synopsis}</p>}
                <hr className="modal-sep" />
                <h3 className="modal-sub-title">Édition</h3>
                <dl className="modal-facts">
                    <dt>Année</dt><dd>{yearLabel(game)}</dd>
                    <dt>Éditeur</dt><dd>{editorLabel(game)}</dd>
                    <dt>Catégorie</dt><dd>{category}</dd>
                    <dt>Joueurs</dt><dd>{playersLabel(game)}</dd>
                    {game.rating != null && <><dt>Note</dt><dd>{game.rating}/10</dd></>}
                </dl>
                {game.notes && <p className="modal-notes"><Linkified text={game.notes} /></p>}
            </>
        );
    }

    if (plateKey === 'dump') {
        const groups: Record<string, GameDump[]> = {};
        for (const d of ownDumps(game)) {
            if (!groups[d.category]) groups[d.category] = [];
            groups[d.category].push(d);
        }
        const others = otherReleaseFiles(game);
        return (
            <>
                {Object.entries(groups).map(([category, items]) => (
                    <div key={category} className="dump-block">
                        <h3 className="dump-label">{category}</h3>
                        {items.map((d, i) => (
                            <div key={i} className="dump-item">
                                <FileLine name={d.file_name} url={d.url} size={d.size} />
                                {d.loading_command && <p>Commande : <code>{d.loading_command}</code></p>}
                                {d.protection      && <p>Protection : {d.protection}</p>}
                            </div>
                        ))}
                    </div>
                ))}
                {others.length > 0 && (
                    <div className="dump-block">
                        <h3 className="dump-label">Autres fichiers</h3>
                        {others.map(f => <FileLine key={f.url} name={f.name} url={f.url} size={f.size} />)}
                    </div>
                )}
            </>
        );
    }

    if (plateKey === 'scans') {
        return (
            <ul className="scan-gallery">
                {(game.files?.scans ?? []).map(s => (
                    <li key={s.url}>
                        <a className="scan-item" href={s.url} target="_blank" rel="noopener noreferrer">
                            <img src={s.url} alt="" loading="lazy" />
                            <span className="scan-caption">
                                {s.type && <strong>{SCAN_TYPES[s.type] ?? s.type}</strong>}
                                {s.name}
                                <span className="sr-only">{NEW_TAB}</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        );
    }

    if (plateKey === 'manual') {
        const manuals = game.files?.manuals ?? [];
        const pdf     = manuals.find(m => m.name.toLowerCase().endsWith('.pdf'));
        return (
            <>
                <div className="dump-block">
                    {manuals.map(m => <FileLine key={m.url} name={m.name} url={m.url} size={m.size} viewable />)}
                </div>
                {pdf && (
                    <object className="manual-viewer" data={pdf.url} type="application/pdf" aria-label={`Manuel : ${pdf.name}`}>
                        <p className="manual-fallback">
                            Aperçu indisponible dans ce navigateur :{' '}
                            <a href={pdf.url} target="_blank" rel="noopener noreferrer">ouvrir {pdf.name}<span className="sr-only">{NEW_TAB}</span></a>
                        </p>
                    </object>
                )}
            </>
        );
    }

    if (plateKey === 'compilation') return <CompilationModal game={game} />;
    if (plateKey === 'compil_d7')   return <CompilSupportModal game={game} support="D7" />;
    if (plateKey === 'compil_k7')   return <CompilSupportModal game={game} support="K7" />;

    if (plateKey === 'authors') {
        return (
            <ul className="modal-list">
                {(game.authors ?? []).map((a: GameAuthor, i: number) => (
                    <li key={i}><strong>{a.role} :</strong> {a.name}</li>
                ))}
            </ul>
        );
    }

    if (plateKey === 'tips') {
        return <ul className="modal-list">{(game.tips ?? []).map((t, i) => <li key={i}><Linkified text={t} /></li>)}</ul>;
    }

    if (plateKey === 'bugs') {
        return (
            <ul className="modal-list bug-list">
                {(game.bugs ?? []).map((b, i) => <li key={i}><span aria-hidden="true">⚠ </span><Linkified text={b} /></li>)}
            </ul>
        );
    }

    if (plateKey === 'comments') {
        return (
            <>
                {(game.comments ?? []).map((c: GameComment, i: number) => (
                    <div key={i} className="dump-block">
                        {c.author  && <p><strong>{c.author}</strong></p>}
                        {c.content && <p className="comment-quote"><Linkified text={c.content} /></p>}
                    </div>
                ))}
            </>
        );
    }

    return null;
}

/**
 * Fenêtre modale accessible : rôle dialog nommé par son titre, focus sur « Fermer » à
 * l'ouverture, Échap pour fermer, reste de la page inerte (clavier et lecteurs d'écran
 * restent dans la modale), défilement de la page bloqué.
 */
function Dialog({ code, title, onClose, children }: { code: string; title: string; onClose: () => void; children: ReactNode }) {
    const rootRef  = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const made: Element[] = [];
        for (const el of Array.from(document.body.children)) {
            if (el !== root && !el.hasAttribute('inert')) {
                el.setAttribute('inert', '');
                made.push(el);
            }
        }
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            made.forEach(el => el.removeAttribute('inert'));
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    return (
        <div className="dialog-root" ref={rootRef}>
            <div className="puzzle-overlay active" onClick={onClose} />
            <div className="puzzle-modal active" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div className="modal-header">
                    <h2 className="modal-sys-title" id="modal-title">
                        <span className="modal-code" aria-hidden="true">{code}</span>
                        {title}
                    </h2>
                    <button ref={closeRef} type="button" className="modal-close-btn" onClick={onClose}>
                        <span aria-hidden="true">[×] </span>FERMER
                    </button>
                </div>
                {/* Atteignable au clavier : on peut le faire défiler aux flèches */}
                <div className="modal-body" tabIndex={0}>{children}</div>
            </div>
        </div>
    );
}

/* ── Composant principal ── */
export default function GameDetail({ game }: Props) {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    const systemId = 'ID_' + String(game.id).padStart(4, '0');
    const catStr   = game.categories?.length ? ' · ' + game.categories[0] : '';
    const sub      = `${yearLabel(game)} — ${editorLabel(game)}${catStr}`;

    const cover = game.files?.thumbnail ?? game.files?.scans?.[0]?.url;

    // Contenu disponible : libellé en clair, signalé par un symbole et non par la seule couleur
    const available: [string, boolean][] = [
        ['Fichiers',       (game.dumps?.length ?? 0) > 0],
        ['Téléchargement', (game.dumps ?? []).some(d => d.url) || otherReleaseFiles(game).length > 0],
        ['Scans',          (game.files?.scans?.length   ?? 0) > 0],
        ['Manuel',         (game.files?.manuals?.length ?? 0) > 0],
        ['Astuces',        (game.tips?.length     ?? 0) > 0],
        ['Bugs',           (game.bugs?.length     ?? 0) > 0],
        ['Commentaires',   (game.comments?.length ?? 0) > 0],
        ['Équipe',         (game.authors?.length  ?? 0) > 0],
    ];

    const activePlates = PLATE_LAYOUT.filter(p => hasData(p.key, game));
    const activePlate  = PLATE_LAYOUT.find(p => p.key === activeKey);

    function openModal(key: string, opener: HTMLElement) {
        openerRef.current = opener;
        setActiveKey(key);
    }

    const closeModal = useCallback(() => {
        setActiveKey(null);
        // Focus rendu au bouton qui a ouvert la modale (une fois la page réactivée)
        requestAnimationFrame(() => openerRef.current?.focus());
    }, []);

    return (
        <main id="contenu" className="detail-root">
            {/* ── HERO ── */}
            <div className="game-hero" id="game-hero">
                <div className="game-hero-inner">
                    <div className={`game-hero-cover${cover ? ' game-hero-cover--image' : ''}`}>
                        {cover ? <img src={cover} alt={`Capture d’écran de ${game.main_title}`} /> : <span aria-hidden="true">📦</span>}
                    </div>
                    <div className="game-hero-meta">
                        <p className="hero-system-id"><span className="sr-only">Jeu n° </span>{systemId}</p>
                        <h1 className="hero-title">{game.main_title}</h1>
                        <p className="hero-sub">{sub}</p>
                        <ul className="hero-tags" aria-label="Contenu de la fiche">
                            {game.origin === 'AI_ASSISTED' && (
                                <li className="hero-tag hero-tag--ai">IA ASSISTÉ<span className="sr-only"> : jeu réalisé avec l’aide d’une IA</span></li>
                            )}
                            {available.map(([label, on]) => (
                                <li key={label} className={`hero-tag${on ? ' hero-tag--on' : ' hero-tag--off'}`}>
                                    <span aria-hidden="true">{on ? '✓ ' : '– '}</span>
                                    {label.toUpperCase()}
                                    <span className="sr-only">{on ? ' : disponible' : ' : absent'}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* ── BENTO ── */}
            <div className="detail-main">
                <div className="bento-puzzle">
                    {activePlates.map(p => (
                        <section
                            key={p.key}
                            className={`metal-plate ${p.size}`}
                            aria-labelledby={`plate-${p.key}`}
                            onClick={e => {
                                // Clic à la souris n'importe où sur la plaque ; au clavier : le bouton
                                const button = e.currentTarget.querySelector<HTMLElement>('.read-more-indicator');
                                if (button) openModal(p.key, button);
                            }}
                        >
                            <h2 className="plate-label" id={`plate-${p.key}`}>
                                <span className="plate-code" aria-hidden="true">{p.code}</span>
                                <span className="plate-name">{p.title}</span>
                            </h2>
                            <div className="plate-content">
                                <PlatePreview plateKey={p.key} game={game} />
                            </div>
                            <button
                                type="button"
                                className="read-more-indicator"
                                aria-haspopup="dialog"
                                onClick={e => {
                                    e.stopPropagation();
                                    openModal(p.key, e.currentTarget);
                                }}
                            >
                                TOUT VOIR<span className="sr-only"> : {p.title}</span><span aria-hidden="true"> »</span>
                            </button>
                        </section>
                    ))}
                </div>
            </div>

            {/* ── MODALE ── */}
            {activePlate && createPortal(
                <Dialog code={activePlate.code} title={activePlate.title} onClose={closeModal}>
                    <ModalContent plateKey={activePlate.key} game={game} />
                </Dialog>,
                document.body,
            )}
        </main>
    );
}
