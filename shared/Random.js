
export function hashSeed(value) {
    const text = String(value);
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

export function createSeededRandom(seed) {
    let state = seed >>> 0;

    if (state === 0) {
        state = 1;
    }

    return function random() {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;

        return (state >>> 0) / 4294967296;
    };
}
