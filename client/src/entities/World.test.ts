import { describe, expect, it } from "vitest";
import { World } from "./World.ts";
import { Vector2 } from "./Vector2.ts";

describe("World object pools", () => {
    it("reuses destroyed bullets from the pool", () => {
        const world = new World(1200, 800);
        world.setNetworkMode(true);

        const first = world.spawnBullet(
            new Vector2(100, 100),
            new Vector2(10, 0),
            "player-1"
        );

        const firstId = first.id;

        world.step(3);

        expect(first.dead).toBe(true);
        expect(world.entities.has(firstId)).toBe(false);

        const second = world.spawnBullet(
            new Vector2(200, 200),
            new Vector2(0, 10),
            "player-2"
        );

        expect(second).toBe(first);
        expect(second.id).toBe(firstId);
        expect(second.dead).toBe(false);
        expect(second.ownerId).toBe("player-2");
        expect(second.ttl).toBe(2);
    });

    it("reuses destroyed particles from the pool", () => {
        const world = new World(1200, 800);
        world.setNetworkMode(true);

        world.explode(new Vector2(100, 100), 1);

        const first = [...world.ofKind("particle")][0];

        expect(first).toBeDefined();

        const firstId = first!.id;

        world.step(2);

        expect(first!.dead).toBe(true);
        expect(world.entities.has(firstId)).toBe(false);

        world.explode(new Vector2(300, 300), 1);

        const second = [...world.ofKind("particle")][0];

        expect(second).toBe(first);
        expect(second!.id).toBe(firstId);
        expect(second!.dead).toBe(false);
        expect(second!.position.x).toBe(300);
        expect(second!.position.y).toBe(300);
    });
});
