/**
 * Text as a URL or folder segment: no accents, lowercase, words joined by dashes.
 * Matches the backoffice slugify (Library folders).
 *
 * @param text - Any text (category, game title…).
 */
export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Address of a game page: its number then its title, /game/20014-papy-commando. The page only
 * reads the number: an older address (/game/20014) or an outdated title redirects to this one.
 *
 * @param game - The game number and title.
 */
export function gameUrl(game: { id: number; main_title?: string }): string {
    const slug = slugify(game.main_title ?? '');
    return `/game/${game.id}${slug ? `-${slug}` : ''}`;
}
