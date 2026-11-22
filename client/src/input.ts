
export interface InputState {
    readonly forward: boolean;
    readonly backward: boolean;
    readonly left: boolean;
    readonly right: boolean;
}

export interface GameInput {
    isPressed(code: string): boolean;
    getState(): InputState;
    destroy(): void;
}

export function createInput(): GameInput {
    const keys = new Set<string>();

    const onKeyDown = (event: KeyboardEvent): void => {
        keys.add(event.code);

        if (
            [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Space",
            ].includes(event.code)
        ) {
            event.preventDefault();
        }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
        keys.delete(event.code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return {
        isPressed(code: string): boolean {
            return keys.has(code);
        },

        getState(): InputState {
            return {
                forward:
                    keys.has("KeyW") ||
                    keys.has("ArrowUp"),

                backward:
                    keys.has("KeyS") ||
                    keys.has("ArrowDown"),

                left:
                    keys.has("KeyA") ||
                    keys.has("ArrowLeft"),

                right:
                    keys.has("KeyD") ||
                    keys.has("ArrowRight"),
            };
        },

        destroy(): void {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            keys.clear();
        },
    };
}
