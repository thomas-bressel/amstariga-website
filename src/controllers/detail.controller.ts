import { fetchGame } from '../share/models/games';
import type { Game } from '../share/types/game';

export interface DetailPageData {
    game: Game;
}

export async function getDetailData(id: number): Promise<DetailPageData> {
    const game = await fetchGame(id);
    return { game };
}
