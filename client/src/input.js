export function createInput() {
    const keys = new Set();

    const onKeyDown = (event) => {
        keys.add(event.code);

        if (
            [
                'ArrowUp',
                'ArrowDown',
                'ArrowLeft',
                'ArrowRight',
                'Space',
            ].includes(event.code)
        ) {
            event.preventDefault();
        }
    };

    const onKeyUp = (event) => {
        keys.delete(event.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return {
        isPressed(code) {
            return keys.has(code);
        },

        getState() {
            return {
                forward:
                    keys.has('KeyW') ||
                    keys.has('ArrowUp'),

                backward:
                    keys.has('KeyS') ||
                    keys.has('ArrowDown'),

                left:
                    keys.has('KeyA') ||
                    keys.has('ArrowLeft'),

                right:
                    keys.has('KeyD') ||
                    keys.has('ArrowRight'),
            };
        },

        destroy() {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        },
    };
}