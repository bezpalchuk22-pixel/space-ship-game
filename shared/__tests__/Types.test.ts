import { describe, expect, it } from "vitest";
import {
    toEntityId,
    toPlayerId,
    toTick,
    toSequenceNumber
} from "../Types.js";

describe("toEntityId", () => {
    it("accepts a valid entity ID", () => {
        expect(toEntityId("asteroid-1")).toBe("asteroid-1");
    });

    it("rejects an empty entity ID", () => {
        expect(() => toEntityId("")).toThrow(TypeError);
    });
});

describe("toPlayerId", () => {
    it("accepts a valid player ID", () => {
        expect(toPlayerId("player-1")).toBe("player-1");
    });

    it("rejects an empty player ID", () => {
        expect(() => toPlayerId("")).toThrow(TypeError);
    });
});

describe("toTick", () => {
    it("accepts zero", () => {
        expect(toTick(0)).toBe(0);
    });

    it("accepts the maximum uint32 value", () => {
        expect(toTick(0xFFFFFFFF)).toBe(0xFFFFFFFF);
    });

    it("rejects negative values", () => {
        expect(() => toTick(-1)).toThrow(RangeError);
    });

    it("rejects fractional values", () => {
        expect(() => toTick(1.5)).toThrow(RangeError);
    });

    it("rejects values above uint32", () => {
        expect(() => toTick(0x100000000)).toThrow(RangeError);
    });

    it("rejects NaN", () => {
        expect(() => toTick(Number.NaN)).toThrow(RangeError);
    });

    it("rejects Infinity", () => {
        expect(() => toTick(Infinity)).toThrow(RangeError);
    });
});

describe("toSequenceNumber", () => {
    it("accepts zero", () => {
        expect(toSequenceNumber(0)).toBe(0);
    });

    it("accepts the maximum uint32 value", () => {
        expect(toSequenceNumber(0xFFFFFFFF)).toBe(0xFFFFFFFF);
    });

    it("rejects negative values", () => {
        expect(() => toSequenceNumber(-1)).toThrow(RangeError);
    });

    it("rejects fractional values", () => {
        expect(() => toSequenceNumber(2.5)).toThrow(RangeError);
    });

    it("rejects values above uint32", () => {
        expect(() => toSequenceNumber(0x100000000)).toThrow(RangeError);
    });

    it("rejects NaN", () => {
        expect(() => toSequenceNumber(Number.NaN)).toThrow(RangeError);
    });

    it("rejects Infinity", () => {
        expect(() => toSequenceNumber(Infinity)).toThrow(RangeError);
    });
});
