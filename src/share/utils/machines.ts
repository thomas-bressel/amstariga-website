/** Machines de la famille Amstrad proposées par le site (slug de l'API → libellés). */
export const MACHINES: { slug: string; label: string; short: string; icon: string }[] = [
    { slug: 'amstrad',      label: 'AMSTRAD CPC',    short: 'CPC',    icon: '🖥️' },
    { slug: 'amstrad-plus', label: 'AMSTRAD PLUS',   short: 'PLUS',   icon: '➕' },
    { slug: 'gx4000',       label: 'AMSTRAD GX4000', short: 'GX4000', icon: '🎮' },
];

/**
 * Badge d'un jeu qui n'est pas un jeu CPC (machine par défaut du site, sans badge) :
 * PLUS, GX4000… Le même jeu peut exister sur CPC et sur Plus, avec un autre rendu.
 *
 * @param slug - Machine du jeu (slug de l'API).
 */
export function machineBadge(slug?: string): string | undefined {
    if (!slug || slug === 'amstrad') return undefined;
    return MACHINES.find(m => m.slug === slug)?.short ?? slug.toUpperCase();
}
