
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
    SHIP_CONFIG,
    createShipState,
    applyShipInput,
    stepShip
} from "../ShipSimulation.js";

import { toPlayerId } from "../Types.js";

describe("ShipSimulation", () => {
    it("creates a ship with default state", () => {
        const ship = createShipState(toPlayerId("player-1"), 100, 200);

        expect(ship.x).toBe(100);
        expect(ship.y).toBe(200);
        expect(ship.angle).toBe(-Math.PI / 2);
        expect(ship.hp).toBe(100);
        expect(ship.vx).toBe(0);
        expect(ship.vy).toBe(0);
    });

    it("applies throttle, turn and shooting input", () => {
        const ship = createShipState(toPlayerId("player-1"), 100, 100);

        applyShipInput(ship, {
            throttle: 1,
            turn: -1,
            shoot: true
        });

        expect(ship.throttle).toBe(1);
        expect(ship.turn).toBe(-1);
        expect(ship.shoot).toBe(true);
    });

    it("clamps throttle and turn to the range [-1, 1]", () => {
        const ship = createShipState(toPlayerId("player-1"), 100, 100);

        applyShipInput(ship, {
            throttle: 5,
            turn: -5,
            shoot: false
        });

        expect(ship.throttle).toBe(1);
        expect(ship.turn).toBe(-1);
    });

    it("moves the ship when throttle is applied", () => {
        const ship = createShipState(toPlayerId("player-1"), 400, 300);

        applyShipInput(ship, {
            throttle: 1,
            turn: 0,
            shoot: false
        });

        stepShip(ship, 0.1, 1000, 800);

        expect(ship.y).toBeLessThan(300);
        expect(ship.x).toBeCloseTo(400);
        expect(ship.vy).toBeLessThan(0);
    });

    it("rotates the ship according to turn input", () => {
        const ship = createShipState(toPlayerId("player-1"), 400, 300);
        const initialAngle = ship.angle;

        applyShipInput(ship, {
            throttle: 0,
            turn: 1,
            shoot: false
        });

        stepShip(ship, 0.1, 1000, 800);

        expect(ship.angle).toBeCloseTo(
            initialAngle + SHIP_CONFIG.rotationSpeed * 0.1
        );
    });

    it("keeps the ship inside the arena using wrap-around", () => {
        const ship = createShipState(toPlayerId("player-1"), 5, 5);

        applyShipInput(ship, {
            throttle: 1,
            turn: 0,
            shoot: false
        });

        stepShip(ship, 1, 100, 100);

        expect(ship.x).toBeGreaterThanOrEqual(0);
        expect(ship.x).toBeLessThan(100);
        expect(ship.y).toBeGreaterThanOrEqual(0);
        expect(ship.y).toBeLessThan(100);
    });

    it("does not allow cooldown to become negative", () => {
        const ship = createShipState(toPlayerId("player-1"), 100, 100);
        ship.cooldown = 0.1;

        stepShip(ship, 0.5, 1000, 800);

        expect(ship.cooldown).toBe(0);
    });

    it("reduces cooldown by elapsed time", () => {
        const ship = createShipState(toPlayerId("player-1"), 100, 100);
        ship.cooldown = 1;

        stepShip(ship, 0.25, 1000, 800);

        expect(ship.cooldown).toBeCloseTo(0.75);
    });

    it("produces deterministic state for identical inputs", () => {
        const first = createShipState(toPlayerId("player-1"), 100, 100);
        const second = createShipState(toPlayerId("player-1"), 100, 100);

        const input = {
            throttle: 1,
            turn: 0.5,
            shoot: true
        };

        applyShipInput(first, input);
        applyShipInput(second, input);

        for (let i = 0; i < 60; i++) {
            stepShip(first, 1 / 60, 1000, 800);
            stepShip(second, 1 / 60, 1000, 800);
        }

        expect(first).toEqual(second);
    });

    it("keeps ship coordinates inside the arena for arbitrary positions", () => {
        fc.assert(
            fc.property(
                fc.double({ min: -10000, max: 10000, noNaN: true }),
                fc.double({ min: -10000, max: 10000, noNaN: true }),
                (x, y) => {
                    const ship = createShipState(toPlayerId("player-1"), x, y);

                    stepShip(ship, 0, 1000, 800);

                    expect(ship.x).toBeGreaterThanOrEqual(0);
                    expect(ship.x).toBeLessThan(1000);
                    expect(ship.y).toBeGreaterThanOrEqual(0);
                    expect(ship.y).toBeLessThan(800);
                }
            ),
            { numRuns: 200 }
        );
    });
});
