import { describe, expect, it } from "vitest";
import { allowMessage } from "../rateLimit.js";

describe("allowMessage", () => {
    it("allows the first message", () => {
        const times: number[] = [];
        expect(allowMessage(times, 1000)).toBe(true);
        expect(times).toEqual([1000]);
    });

    it("allows exactly 60 messages in one second", () => {
        const times: number[] = [];
        for (let i = 0; i < 60; i++) {
            expect(allowMessage(times, 1000)).toBe(true);
        }
        expect(times).toHaveLength(60);
    });

    it("rejects the 61st message", () => {
        const times: number[] = [];
        for (let i = 0; i < 60; i++) {
            allowMessage(times, 1000);
        }
        expect(allowMessage(times, 1000)).toBe(false);
        expect(times).toHaveLength(60);
    });

    it("removes messages older than one second", () => {
        const times = [100, 150, 199];

        expect(allowMessage(times, 1200)).toBe(true);
        expect(times).toEqual([1200]);
    });

    it("keeps messages inside the time window", () => {
        const times = [500, 700, 900];
        expect(allowMessage(times, 1000)).toBe(true);
        expect(times).toEqual([500, 700, 900, 1000]);
    });

    it("allows messages again after the limit expires", () => {
        const times: number[] = [];
        for (let i = 0; i < 60; i++) {
            allowMessage(times, 1000);
        }
        expect(allowMessage(times, 2001)).toBe(true);
        expect(times).toEqual([2001]);
    });

    it("supports a custom message limit", () => {
        const times: number[] = [];
        expect(allowMessage(times, 1000, 2)).toBe(true);
        expect(allowMessage(times, 1000, 2)).toBe(true);
        expect(allowMessage(times, 1000, 2)).toBe(false);
    });

    it("supports a custom time window", () => {
        const times = [1000];
        expect(allowMessage(times, 1250, 10, 200)).toBe(true);
        expect(times).toEqual([1250]);
    });

    it("does not mutate timestamps when the limit is reached", () => {
        const times = [1000, 1000];
        expect(allowMessage(times, 1000, 2)).toBe(false);
        expect(times).toEqual([1000, 1000]);
    });
});
