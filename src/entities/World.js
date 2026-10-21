
import { Vector2 } from "./Vector2.js";
import { Ship } from "./Ship.js";
import { Asteroid } from "./Asteroid.js";
import { Pickup } from "./Pickup.js";
import { Particle } from "./Particle.js";
import { CollisionSystem } from "./CollisionSystem.js";

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.entities = new Map();
        this.collisionSystem = new CollisionSystem();
        this.score = 0;
        this.player = null;
        this.respawnTimer = 0;
    }

    spawn(entity) {
        this.entities.set(entity.id, entity);

        if (entity.kind === "ship" && entity.isPlayer) {
            this.player = entity;
        }

        return entity;
    }

    despawn(entity) {
        entity.destroy();
    }

    *ofKind(kind) {
        for (const entity of this.entities.values()) {
            if (entity.kind === kind && !entity.dead) {
                yield entity;
            }
        }
    }

    explode(position, count = 12) {
        for (let i = 0; i < count; i++) {
            this.spawn(new Particle(position));
        }
    }

    spawnAsteroid() {
        const position = new Vector2(
            Math.random() * this.width,
            Math.random() * this.height
        );

        this.spawn(new Asteroid(position));
    }

    spawnPickup() {
        this.spawn(new Pickup(
            new Vector2(
                Math.random() * this.width,
                Math.random() * this.height
            )
        ));
    }

    step(dt) {
        if (this.player?.dead && this.respawnTimer <= 0) {
            this.respawnTimer = 2;
        }

        if (!this.player || this.player.dead) {
            this.respawnTimer -= dt;

            if (this.respawnTimer <= 0) {
                this.spawn(new Ship(
                    new Vector2(this.width / 2, this.height / 2),
                    true
                ));
                this.respawnTimer = 0;
            }
        }

        // Копія масиву дозволяє безпечно додавати сутності під час оновлення.
        const currentEntities = [...this.entities.values()];

        for (const entity of currentEntities) {
            if (entity.dead) continue;
            entity.update(dt, this);
        }

        this.collisionSystem.check(this);

        // Sweep: видалення позначених об'єктів наприкінці кроку.
        for (const [id, entity] of this.entities) {
            if (entity.dead) {
                this.entities.delete(id);
            }
        }
    }

    render(ctx) {
        for (const entity of this.entities.values()) {
            if (!entity.dead && typeof entity.render === "function") {
                entity.render(ctx);
            }
        }
    }
}
