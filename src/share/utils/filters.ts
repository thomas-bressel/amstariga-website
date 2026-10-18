import type { GameFilters, GameOrigin } from '../types/game';

/** URL search params read by the index page (same names as the API). */
export const FILTER_PARAMS = [
    'search', 'parent_categories', 'child_categories', 'languages', 'years', 'is_adult', 'origin', 'is_isometric',
    'machines',
] as const;

/** ?origin=human | ai_assisted (casse indifférente) → valeur du filtre, undefined sinon. */
function parseOrigin(value: string | null): GameOrigin | undefined {
    switch (value?.toUpperCase()) {
        case 'HUMAN':       return 'HUMAN';
        case 'AI_ASSISTED': return 'AI_ASSISTED';
        default:            return undefined;
    }
}

/**
 * Reads the filters given in a URL (?search=…&parent_categories=…).
 *
 * @param params - The URL search params.
 * @returns      - The filters, empty when the URL has none.
 */
export function filtersFromParams(params: URLSearchParams): GameFilters {
    return {
        search:            params.get('search')?.trim() ?? '',
        parent_categories: params.getAll('parent_categories'),
        child_categories:  params.getAll('child_categories'),
        languages:         params.getAll('languages'),
        years:             params.getAll('years').map(Number).filter(Boolean),
        is_adult:          params.get('is_adult') === 'true' ? true : undefined,
        origin:            parseOrigin(params.get('origin')),
        is_isometric:      params.get('is_isometric') === 'true' ? true : undefined,
        machines:          params.getAll('machines').map(m => m.toLowerCase()),
    };
}

/**
 * Tells whether at least one filter is set (search text, category, language, year, adult, origin,
 * isometric 3D, machine).
 *
 * @param f - The filters to check.
 */
export function hasActiveFilters(f: GameFilters): boolean {
    const selected =
        (f.parent_categories?.length ?? 0) +
        (f.child_categories?.length  ?? 0) +
        (f.languages?.length         ?? 0) +
        (f.years?.length             ?? 0) +
        (f.machines?.length          ?? 0);
    return Boolean(f.search?.trim()) || selected > 0 || f.is_adult !== undefined || f.origin !== undefined
        || f.is_isometric !== undefined;
}
