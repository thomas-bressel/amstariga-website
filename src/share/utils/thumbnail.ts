import type { GameListItem } from '../types/game';
import { slugify } from './slug';

/**
 * Returns the path to the thumbnail for a game, relative to the uploads root. The API gives it
 * with the date of the file (?v=…): /uploads/ is cached for a month, so a thumbnail replaced
 * under the same name gets a new address. Without it (older API), the path is rebuilt:
 *
 * - Compilations: /uploads/compilation/<id>/thumbnail.png
 * - Others:       /uploads/<parent>/<child>/<id>/thumbnail.png
 *                 /uploads/<parent>/divers/<id>/thumbnail.png  (no child)
 */
export function thumbnailPath(game: Pick<GameListItem, 'id' | 'category_parent' | 'category_child' | 'thumbnail'>): string {
    if (game.thumbnail) return game.thumbnail;
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
