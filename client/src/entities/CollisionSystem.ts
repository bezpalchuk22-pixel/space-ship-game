import type { Entity } from "./Entity.ts";
import type { Bullet } from "./Bullet.ts";
import type { Asteroid } from "./Asteroid.ts";
import type { Pickup } from "./Pickup.ts";
import { Vector2 } from "./Vector2.ts";

interface CollisionWorld {
    readonly width: number;
    readonly height: number;
    readonly entities: Map<number, Entity>;
    score: number;
    spawn(entity: Entity): Entity;
    explode(position: Vector2, count?: number): void;
}

interface ShipEntity extends Entity {
    readonly kind: "ship";
    takeDamage(amount: number): void;
    heal(amount: number): void;
}

interface BulletEntity extends Bullet {
    readonly kind: "bullet";
}

interface AsteroidEntity extends Asteroid {
    readonly kind: "asteroid";
}

interface PickupEntity extends Pickup {
    readonly kind: "pickup";
}

function isShip(entity: Entity): entity is ShipEntity {
    return entity.kind === "ship" &&
        "takeDamage" in entity &&
        typeof entity.takeDamage === "function" &&
        "heal" in entity &&
        typeof entity.heal === "function";
}

function isBullet(entity: Entity): entity is BulletEntity {
    return entity.kind === "bullet" &&
        "ownerId" in entity &&
        (typeof entity.ownerId === "number" ||
            typeof entity.ownerId === "string");
}

function isAsteroid(entity: Entity): entity is AsteroidEntity {
    return entity.kind === "asteroid" &&
        "split" in entity &&
        typeof entity.split === "function";
}

function isPickup(entity: Entity): entity is PickupEntity {
    return entity.kind === "pickup";
}

export class CollisionSystem {
    check(world: CollisionWorld): void {
        const entities = [...world.entities.values()];

        for (let i = 0; i < entities.length; i++) {
            const a = entities[i];

            if (!a || a.dead) continue;

            for (let j = i + 1; j < entities.length; j++) {
                const b = entities[j];

                if (!b || b.dead) continue;

                const dx = a.position.x - b.position.x;
                const dy = a.position.y - b.position.y;
                const radius = a.radius + b.radius;
                const distanceSquared = dx * dx + dy * dy;

                if (distanceSquared <= radius * radius) {
                    this.resolve(world, a, b);
                }
            }
        }
    }

    private resolve(
        world: CollisionWorld,
        a: Entity,
        b: Entity
    ): void {
        const bullet = isBullet(a)
            ? a
            : isBullet(b)
                ? b
                : null;

        if (bullet) {
            const other = bullet === a ? b : a;

            if (other.id === bullet.ownerId) return;

            if (isAsteroid(other)) {
                const position = new Vector2(
                    other.position.x,
                    other.position.y
                );

                other.split({
                    width: world.width,
                    height: world.height,
                    spawn: (entity) => world.spawn(entity)
                });
                bullet.destroy();

                world.score += 10;
                world.explode(position);
            } else if (isShip(other)) {
                other.takeDamage(25);

                bullet.destroy();
                world.explode(bullet.position, 4);
            }

            return;
        }

        const ship = isShip(a)
            ? a
            : isShip(b)
                ? b
                : null;

        const pickup = isPickup(a)
            ? a
            : isPickup(b)
                ? b
                : null;

        if (ship && pickup && !ship.dead && !pickup.dead) {
            ship.heal(25);
            pickup.destroy();
            world.score += 5;
            return;
        }

        const asteroid = isAsteroid(a)
            ? a
            : isAsteroid(b)
                ? b
                : null;

        if (ship && asteroid && !ship.dead && !asteroid.dead) {
            const position = new Vector2(
                asteroid.position.x,
                asteroid.position.y
            );

            ship.takeDamage(20);
            asteroid.destroy();
            world.explode(position);
        }
    }
}
