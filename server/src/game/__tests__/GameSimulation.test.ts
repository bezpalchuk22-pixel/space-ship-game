import { describe, expect, it } from "vitest";
import { GameSimulation } from "../GameSimulation.js";
import {
    toPlayerId,
    toSequenceNumber
} from "../../../../shared/Types.js";

const playerId = toPlayerId("player-1");

function createInput(
    seq: number,
    throttle = 0,
    turn = 0,
    shoot = false
) {
    return {
        seq: toSequenceNumber(seq),
        throttle,
        turn,
        shoot
    };
}

describe("GameSimulation", () => {
    it("creates eight initial asteroids", () => {
        const game = new GameSimulation("room-1");

        expect(game.asteroids.size).toBe(8);
    });

    it("adds a player", () => {
        const game = new GameSimulation("room-1");

        game.addPlayer(playerId);

        expect(game.players.has(playerId)).toBe(true);
        expect(game.players.size).toBe(1);
    });

    it("does not add the same player twice", () => {
        const game = new GameSimulation("room-1");

        game.addPlayer(playerId);
        game.addPlayer(playerId);

        expect(game.players.size).toBe(1);
    });

    it("removes a player", () => {
        const game = new GameSimulation("room-1");

        game.addPlayer(playerId);
        game.removePlayer(playerId);

        expect(game.players.has(playerId)).toBe(false);
    });

    it("rejects input from an unknown player", () => {
        const game = new GameSimulation("room-1");

        expect(
            game.handleInput(playerId, createInput(1, 1))
        ).toBe(false);
    });

    it("accepts valid player input", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        expect(
            game.handleInput(playerId, createInput(1, 1))
        ).toBe(true);
    });

    it("rejects duplicate sequence numbers", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        expect(
            game.handleInput(playerId, createInput(1))
        ).toBe(true);

        expect(
            game.handleInput(playerId, createInput(1))
        ).toBe(false);
    });

    it("rejects invalid numeric input", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        expect(
            game.handleInput(playerId, createInput(1, Number.NaN))
        ).toBe(false);
    });

    it("limits the input queue to 120 commands", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        for (let i = 1; i <= 120; i++) {
            expect(
                game.handleInput(playerId, createInput(i))
            ).toBe(true);
        }

        expect(
            game.handleInput(playerId, createInput(121))
        ).toBe(false);
    });

    it("processes one queued input per simulation step", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        game.handleInput(playerId, createInput(1, 1));
        game.handleInput(playerId, createInput(2, 0));

        game.step();

        const snapshot = game.createSnapshot();

        expect(snapshot.players[0]?.seq).toBe(toSequenceNumber(1));
    });

    it("increments the simulation tick", () => {
        const game = new GameSimulation("room-1");

        game.step();
        game.step();

        expect(game.tick).toBe(2);
    });

    it("moves a ship after receiving throttle input", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        const ship = game.players.get(playerId)?.ship;
        if (!ship) throw new Error("Ship was not created");

        const initialY = ship.y;

        game.handleInput(playerId, createInput(1, 1));
        game.step();

        expect(ship.y).toBeLessThan(initialY);
    });

    it("creates a bullet when the player shoots", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        game.handleInput(playerId, createInput(1, 0, 0, true));
        game.step();

        expect(game.bullets.size).toBe(1);
    });

    it("removes a player's bullets when that player leaves", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        game.handleInput(playerId, createInput(1, 0, 0, true));
        game.step();

        expect(game.bullets.size).toBe(1);

        game.removePlayer(playerId);

        expect(game.bullets.size).toBe(0);
    });

    it("creates a snapshot with the current room and tick", () => {
        const game = new GameSimulation("room-1");
        game.addPlayer(playerId);

        const snapshot = game.createSnapshot();

        expect(snapshot.type).toBe("snapshot");
        expect(snapshot.roomId).toBe("room-1");
        expect(snapshot.tick).toBe(0);
        expect(snapshot.players).toHaveLength(1);
        expect(snapshot.asteroids).toHaveLength(8);
    });

    it("produces deterministic asteroid positions for the same room", () => {
        const first = new GameSimulation("same-room");
        const second = new GameSimulation("same-room");

        const firstAsteroids = [...first.asteroids.values()];
        const secondAsteroids = [...second.asteroids.values()];

        expect(firstAsteroids).toEqual(secondAsteroids);
    });

    it("produces different asteroid positions for different rooms", () => {
        const first = new GameSimulation("room-a");
        const second = new GameSimulation("room-b");

        const firstAsteroids = [...first.asteroids.values()];
        const secondAsteroids = [...second.asteroids.values()];

        expect(firstAsteroids).not.toEqual(secondAsteroids);
    });
});
