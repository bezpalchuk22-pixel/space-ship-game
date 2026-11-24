import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createSeededRandom, hashSeed } from "../Random.js";

describe("Random", () => {
    it("produces the same hash for the same seed", () => {
        expect(hashSeed("space-ship")).toBe(hashSeed("space-ship"));
    });

    it("produces different hashes for different seeds", () => {
        expect(hashSeed("alpha")).not.toBe(hashSeed("beta"));
    });

    it("produces repeatable sequences", () => {
        const first = createSeededRandom(12345);
        const second = createSeededRandom(12345);

        for (let i = 0; i < 100; i++) {
            expect(first()).toBe(second());
        }
    });

    it("always produces values in the range [0, 1)", () => {
        fc.assert(
            fc.property(fc.integer(), (seed) => {
                const random = createSeededRandom(seed);

                for (let i = 0; i < 100; i++) {
                    const value = random();

                    expect(value).toBeGreaterThanOrEqual(0);
                    expect(value).toBeLessThan(1);
                }
            }),
            { numRuns: 100 }
        );
    });

    it("handles zero seed", () => {
        const random = createSeededRandom(0);

        expect(random()).toBeGreaterThanOrEqual(0);
        expect(random()).toBeLessThan(1);
    });
});
