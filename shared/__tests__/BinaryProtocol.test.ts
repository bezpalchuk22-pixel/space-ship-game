
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
    encodeInput,
    decodeInput,
    encodeSnapshot,
    decodeSnapshot,
    decodePacket
} from "../BinaryProtocol.js";

import {
    toPlayerId,
    toEntityId,
    toSequenceNumber,
    toTick
} from "../Types.js";

import type { GameSnapshot } from "../Types.js";

describe("BinaryProtocol", () => {
    it("encodes and decodes input packets correctly", () => {
        const input = {
            seq: toSequenceNumber(123),
            throttle: 1,
            turn: -1,
            shoot: true
        };

        const decoded = decodeInput(encodeInput(input));

        expect(decoded.seq).toBe(input.seq);
        expect(decoded.throttle).toBe(1);
        expect(decoded.turn).toBe(-1);
        expect(decoded.shoot).toBe(true);
    });

    it("keeps input packets exactly 11 bytes long", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 0xFFFFFFFF }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.boolean(),
                (seq, throttle, turn, shoot) => {
                    const packet = encodeInput({
                        seq: toSequenceNumber(seq),
                        throttle,
                        turn,
                        shoot
                    });

                    expect(packet.byteLength).toBe(11);
                }
            ),
            { numRuns: 200 }
        );
    });

    it("preserves input values within quantization precision", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 0xFFFFFFFF }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.boolean(),
                (seq, throttle, turn, shoot) => {
                    const decoded = decodeInput(
                        encodeInput({
                            seq: toSequenceNumber(seq),
                            throttle,
                            turn,
                            shoot
                        })
                    );

                    expect(decoded.seq).toBe(seq);
                    expect(decoded.throttle).toBeCloseTo(
                        Math.round(throttle * 127) / 127,
                        10
                    );
                    expect(decoded.turn).toBeCloseTo(
                        Math.round(turn * 127) / 127,
                        10
                    );
                    expect(decoded.shoot).toBe(shoot);
                }
            ),
            { numRuns: 300 }
        );
    });

    it("encodes and decodes snapshots", () => {
        const snapshot: GameSnapshot = {
            type: "snapshot",
            tick: toTick(100),
            serverTime: 1234.5,
            players: [
                {
                    kind: "player",
                    id: toPlayerId("player-1"),
                    seq: toSequenceNumber(42),
                    x: 100.5,
                    y: 200.25,
                    angle: 1.2,
                    hp: 90
                }
            ],
            asteroids: [
                {
                    kind: "asteroid",
                    id: toEntityId("asteroid-1"),
                    x: 300,
                    y: 400,
                    radius: 25
                }
            ],
            pickups: [
                {
                    kind: "pickup",
                    id: toEntityId("pickup-1"),
                    x: 500,
                    y: 600,
                    radius: 10
                }
            ],
            bullets: [
                {
                    kind: "bullet",
                    id: toEntityId("bullet-1"),
                    ownerId: toPlayerId("player-1"),
                    x: 150,
                    y: 250
                }
            ]
        };

        const decoded = decodeSnapshot(encodeSnapshot(snapshot));

        expect(decoded.tick).toBe(snapshot.tick);
        expect(decoded.serverTime).toBe(snapshot.serverTime);
        const player = decoded.players[0];
        const asteroid = decoded.asteroids[0];
        const pickup = decoded.pickups[0];
        const bullet = decoded.bullets[0];

        expect(player).toBeDefined();
        expect(asteroid).toBeDefined();
        expect(pickup).toBeDefined();
        expect(bullet).toBeDefined();

        if (!player || !asteroid || !pickup || !bullet) {
            throw new Error("Decoded snapshot is missing expected entities");
        }

        expect(player.id).toBe("player-1");
        expect(player.x).toBeCloseTo(100.5);
        expect(player.y).toBeCloseTo(200.25);
        expect(player.angle).toBeCloseTo(1.2, 3);
        expect(asteroid.id).toBe("asteroid-1");
        expect(pickup.id).toBe("pickup-1");
        expect(bullet.ownerId).toBe("player-1");
    });

    it("calculates snapshot packet length correctly", () => {
        const snapshot: GameSnapshot = {
            type: "snapshot",
            tick: toTick(1),
            serverTime: 100,
            players: [
                {
                    kind: "player",
                    id: toPlayerId("pilot"),
                    seq: toSequenceNumber(1),
                    x: 10,
                    y: 20,
                    angle: 0,
                    hp: 100
                }
            ],
            asteroids: [
                {
                    kind: "asteroid",
                    id: toEntityId("rock"),
                    x: 30,
                    y: 40,
                    radius: 15
                }
            ],
            pickups: [],
            bullets: []
        };

        // Header and counters: 24 bytes.
        // Player: string length + ID + 15 bytes of data.
        // Asteroid: string length + ID + 12 bytes of data.
        const expectedLength =
            24 +
            (1 + 5 + 15) +
            (1 + 4 + 12);

        expect(encodeSnapshot(snapshot).byteLength)
            .toBe(expectedLength);
    });

    it("rejects buffers with invalid packet magic", () => {
        fc.assert(
            fc.property(
                fc.uint8Array({ minLength: 4, maxLength: 64 }),
                (bytes) => {
                    const corrupted = Uint8Array.from(bytes);

                    corrupted[0] = 0;
                    corrupted[1] = 0;

                    expect(() => decodePacket(corrupted))
                        .toThrow();
                }
            ),
            { numRuns: 200 }
        );
    });

    it("decodes valid packets through the generic parser", () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 0xFFFFFFFF }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.double({ min: -1, max: 1, noNaN: true }),
                fc.boolean(),
                (seq, throttle, turn, shoot) => {
                    const encoded = encodeInput({
                        seq: toSequenceNumber(seq),
                        throttle,
                        turn,
                        shoot
                    });

                    const decoded = decodePacket(encoded);

                    expect(decoded).toEqual(decodeInput(encoded));
                }
            ),
            { numRuns: 200 }
        );
    });

    it("rejects truncated input packets", () => {
        const validPacket = encodeInput({
            seq: toSequenceNumber(1),
            throttle: 1,
            turn: 0,
            shoot: false
        });

        const truncated = validPacket.slice(0, 8);

        expect(() => decodeInput(truncated)).toThrow();
        expect(() => decodePacket(truncated)).toThrow();
    });

    it("rejects unsupported packet versions", () => {
        const packet = encodeInput({
            seq: toSequenceNumber(1),
            throttle: 0,
            turn: 0,
            shoot: false
        });

        new DataView(packet).setUint8(2, 99);

        expect(() => decodePacket(packet))
            .toThrow("Unsupported packet version");
    });
    it("decodes packets from ArrayBufferView with a non-zero byteOffset", () => {
        const packet = encodeInput({
            seq: toSequenceNumber(123),
            throttle: 0.5,
            turn: -0.5,
            shoot: true
        });

        const padded = new Uint8Array(packet.byteLength + 10);
        padded.set(new Uint8Array(packet), 5);

        const view = new Uint8Array(padded.buffer, 5, packet.byteLength);
        const decoded = decodeInput(view);

        expect(decoded.seq).toBe(123);
        expect(decoded.throttle).toBeCloseTo(64 / 127);
        expect(decoded.turn).toBeCloseTo(-63 / 127);
        expect(decoded.shoot).toBe(true);
    });

    it("rejects input packets with invalid magic", () => {
        const packet = encodeInput({
            seq: toSequenceNumber(1),
            throttle: 0,
            turn: 0,
            shoot: false
        });

        new DataView(packet).setUint16(0, 0, true);

        expect(() => decodeInput(packet)).toThrow("Invalid packet magic");
    });

    it("rejects input packets with invalid packet type", () => {
        const packet = encodeInput({
            seq: toSequenceNumber(1),
            throttle: 0,
            turn: 0,
            shoot: false
        });

        new DataView(packet).setUint8(3, 99);

        expect(() => decodeInput(packet)).toThrow("Invalid packet type");
    });

    it("rejects packets with a header shorter than four bytes", () => {
        expect(() => decodePacket(new ArrayBuffer(3)))
            .toThrow("Packet is too short");

        expect(() => decodeInput(new ArrayBuffer(3)))
            .toThrow("Invalid input packet size");
    });

    it("rejects snapshot packets shorter than the header", () => {
        expect(() => decodeSnapshot(new ArrayBuffer(23)))
            .toThrow("Snapshot packet is too short");
    });

    it("rejects snapshots with invalid magic and packet type", () => {
        const packet = encodeSnapshot({
            type: "snapshot",
            tick: toTick(1),
            serverTime: 0,
            players: [],
            asteroids: [],
            pickups: [],
            bullets: []
        });

        const invalidMagic = packet.slice(0);
        new DataView(invalidMagic).setUint16(0, 0, true);

        expect(() => decodeSnapshot(invalidMagic))
            .toThrow("Invalid packet magic");

        const invalidType = packet.slice(0);
        new DataView(invalidType).setUint8(3, 99);

        expect(() => decodeSnapshot(invalidType))
            .toThrow("Invalid packet type");
    });

    it("rejects snapshots with excessive entity counts", () => {
        const packet = encodeSnapshot({
            type: "snapshot",
            tick: toTick(1),
            serverTime: 0,
            players: [],
            asteroids: [],
            pickups: [],
            bullets: []
        });

        new DataView(packet).setUint16(16, 101, true);

        expect(() => decodeSnapshot(packet))
            .toThrow("Snapshot entity limit exceeded");
    });

    it("rejects snapshots with missing entity data", () => {
        const packet = encodeSnapshot({
            type: "snapshot",
            tick: toTick(1),
            serverTime: 0,
            players: [],
            asteroids: [],
            pickups: [],
            bullets: []
        });

        new DataView(packet).setUint16(16, 1, true);

        expect(() => decodeSnapshot(packet)).toThrow();
    });

    it("rejects snapshots with invalid string length", () => {
        const packet = new ArrayBuffer(25);
        const view = new DataView(packet);

        view.setUint16(0, 0x5353, true);
        view.setUint8(2, 1);
        view.setUint8(3, 1);
        view.setUint16(16, 1, true);
        view.setUint8(24, 255);

        expect(() => decodeSnapshot(packet))
            .toThrow("Invalid string length");
    });

    it("rejects snapshots with empty player identifiers", () => {
        const packet = new ArrayBuffer(40);
        const view = new DataView(packet);

        view.setUint16(0, 0x5353, true);
        view.setUint8(2, 1);
        view.setUint8(3, 1);
        view.setUint16(16, 1, true);
        view.setUint8(24, 0);

        expect(() => decodeSnapshot(packet))
           .toThrow("PlayerId cannot be empty");
    });

    it("rejects snapshots with unexpected trailing data", () => {
        const packet = encodeSnapshot({
            type: "snapshot",
            tick: toTick(1),
            serverTime: 0,
            players: [],
            asteroids: [],
            pickups: [],
            bullets: []
        });

        const extended = new Uint8Array(packet.byteLength + 1);
        extended.set(new Uint8Array(packet));

        expect(() => decodeSnapshot(extended))
            .toThrow("Unexpected data at end of snapshot");
    });

    it("rejects snapshots with strings longer than 255 UTF-8 bytes", () => {
        const snapshot: GameSnapshot = {
            type: "snapshot",
            tick: toTick(1),
            serverTime: 0,
            players: [
                {
                    kind: "player",
                    id: toPlayerId("a".repeat(256)),
                    seq: toSequenceNumber(1),
                    x: 0,
                    y: 0,
                    angle: 0,
                    hp: 100
                }
            ],
            asteroids: [],
            pickups: [],
            bullets: []
        };

        expect(() => encodeSnapshot(snapshot))
            .toThrow("String is too long");
    });

    it("clamps input values outside the allowed range", () => {
        const decoded = decodeInput(
            encodeInput({
                seq: toSequenceNumber(1),
                throttle: 10,
                turn: -10,
                shoot: false
            })
        );

        expect(decoded.throttle).toBe(1);
        expect(decoded.turn).toBe(-1);
        expect(decoded.shoot).toBe(false);
    });

    it("rejects unknown binary packet types", () => {
        const packet = encodeInput({
            seq: toSequenceNumber(1),
            throttle: 0,
            turn: 0,
            shoot: false
        });

        new DataView(packet).setUint8(3, 99);

        expect(() => decodePacket(packet))
            .toThrow("Unknown binary packet type: 99");
    });

    it("rejects truncated player data in snapshots", () => {
        const packet = new ArrayBuffer(30);
        const view = new DataView(packet);

        view.setUint16(0, 0x5353, true);
        view.setUint8(2, 1);
        view.setUint8(3, 1);
        view.setUint16(16, 1, true);
        view.setUint8(24, 1);
        view.setUint8(25, 65);

        expect(() => decodeSnapshot(packet))
            .toThrow("Unexpected end of binary packet");
    });

});
