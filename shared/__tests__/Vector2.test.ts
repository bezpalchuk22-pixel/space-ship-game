import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Vector2 } from "../Vector2.js";

describe("Vector2", () => {
    it("adds two vectors", () => {
        expect(new Vector2(2, 3).add(new Vector2(4, 5)))
            .toEqual(new Vector2(6, 8));
    });

    it("subtracts two vectors", () => {
        expect(new Vector2(7, 9).subtract(new Vector2(2, 4)))
            .toEqual(new Vector2(5, 5));
    });

    it("multiplies a vector by a scalar", () => {
        expect(new Vector2(2, -3).multiply(2))
            .toEqual(new Vector2(4, -6));
    });

    it("calculates vector length", () => {
        expect(new Vector2(3, 4).length).toBe(5);
    });

    it("normalizes non-zero vectors to length 1", () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                (x, y) => {
                    const vector = new Vector2(x, y);
                    const normalized = vector.normalize();

                    if (vector.length === 0) {
                        expect(normalized).toEqual(new Vector2(0, 0));
                    } else {
                        expect(normalized.length).toBeCloseTo(1, 10);
                    }
                }
            ),
            { numRuns: 500 }
        );
    });

    it("keeps zero vector unchanged when normalized", () => {
        expect(new Vector2(0, 0).normalize())
            .toEqual(new Vector2(0, 0));
    });

    it("calculates distance symmetrically", () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                (x1, y1, x2, y2) => {
                    const a = new Vector2(x1, y1);
                    const b = new Vector2(x2, y2);

                    expect(a.distanceTo(b))
                        .toBeCloseTo(b.distanceTo(a), 10);
                }
            ),
            { numRuns: 300 }
        );
    });

    it("creates vectors from angles", () => {
        const vector = Vector2.fromAngle(0, 5);

        expect(vector.x).toBeCloseTo(5);
        expect(vector.y).toBeCloseTo(0);
    });
});
