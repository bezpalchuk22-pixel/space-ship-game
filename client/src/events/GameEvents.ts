
export interface GameEventMap {
    fired: Record<string, never>;
    hit: Record<string, never>;
    exploded: Record<string, never>;
}

export type GameEventName = keyof GameEventMap;

class GameEventBus extends EventTarget {
    emit<K extends GameEventName>(
        eventName: K,
        detail: GameEventMap[K]
    ): void {
        this.dispatchEvent(
            new CustomEvent<GameEventMap[K]>(eventName, { detail })
        );
    }
}

export const gameEvents = new GameEventBus();
