import type { GameListItem } from '../types/game';

/**
 * Converts a category name to its slugified folder name.
 * Matches the logic in backoffice/src/scraper/images.py::slugify().
 */
function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Returns the path to the thumbnail for a game, relative to the uploads root.
 *
 * - Compilations: /uploads/compilation/<id>/thumbnail.png
 * - Others:       /uploads/<parent>/<child>/<id>/thumbnail.png
 *                 /uploads/<parent>/divers/<id>/thumbnail.png  (no child)
 */
export function thumbnailPath(game: Pick<GameListItem, 'id' | 'category_parent' | 'category_child'>): string {
    const parent = game.category_parent ?? '';
    const child  = game.category_child  ?? '';
    const slug   = slugify(parent);

    if (slug === 'compilation') {
        return `/uploads/compilation/${game.id}/thumbnail.png`;
    }

    const parentSlug = slug || 'divers';
    const childSlug  = child ? slugify(child) : 'divers';
    return `/uploads/${parentSlug}/${childSlug}/${game.id}/thumbnail.png`;
}
