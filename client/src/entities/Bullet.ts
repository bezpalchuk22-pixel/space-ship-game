import { Entity } from "./Entity.js";
import { Vector2 } from "./Vector2.ts";

interface HomingTarget {
    readonly kind: string;
    readonly dead: boolean;
    readonly position: Vector2;
}

interface HomingWorld {
    readonly entities: Map<number, HomingTarget>;
}

interface BulletWorld extends HomingWorld {
    readonly width: number;
    readonly height: number;
}

class HomingBehavior {
    constructor(private readonly turnRate: number = 3) { }

    update(bullet: Bullet, world: HomingWorld, dt: number): void {
        let target: HomingTarget | null = null;
        let bestDistance = Infinity;

        for (const entity of world.entities.values()) {
            if (entity.kind !== "asteroid" || entity.dead) continue;

            const distance = bullet.position.distanceTo(entity.position);

            if (distance < bestDistance) {
                bestDistance = distance;
                target = entity;
            }
        }

        if (!target) return;

        const dx = target.position.x - bullet.position.x;
        const dy = target.position.y - bullet.position.y;
        const desiredLength = Math.hypot(dx, dy);

        const desiredX = desiredLength === 0 ? 0 : dx / desiredLength;
        const desiredY = desiredLength === 0 ? 0 : dy / desiredLength;

        const velocityLength = Math.hypot(
            bullet.velocity.x,
            bullet.velocity.y
        );

        const currentX = velocityLength === 0
            ? 0
            : bullet.velocity.x / velocityLength;

        const currentY = velocityLength === 0
            ? 0
            : bullet.velocity.y / velocityLength;

        const blend = Math.min(1, this.turnRate * dt);

        const blendedX = currentX * (1 - blend) + desiredX * blend;
        const blendedY = currentY * (1 - blend) + desiredY * blend;

        const blendedLength = Math.hypot(blendedX, blendedY);

        bullet.velocity = blendedLength === 0
            ? new Vector2()
            : new Vector2(
                blendedX / blendedLength * bullet.speed,
                blendedY / blendedLength * bullet.speed
            );
    }
}

function isBulletWorld(value: unknown): value is BulletWorld {
    if (typeof value !== "object" || value === null) return false;

    return (
        "width" in value &&
        typeof value.width === "number" &&
        "height" in value &&
        typeof value.height === "number" &&
        "entities" in value &&
        value.entities instanceof Map
    );
}

export class Bullet extends Entity {
    ownerId: number | string;
    ttl: number;
    speed: number;
    private homingBehavior: HomingBehavior | null;

    constructor(
        position: Vector2,
        velocity: Vector2,
        ownerId: number | string,
        homing = false
    ) {
        super({
            position,
            velocity,
            radius: 4,
            kind: "bullet"
        });

        this.ownerId = ownerId;
        this.ttl = 2;
        this.speed = velocity.length;
        this.homingBehavior = homing ? new HomingBehavior() : null;
    }

    reset(
        position: Vector2,
        velocity: Vector2,
        ownerId: number | string,
        homing = false
    ): void {
        this.position = position;
        this.velocity = velocity;
        this.ownerId = ownerId;
        this.speed = velocity.length;
        this.ttl = 2;
        this.dead = false;
        this.homingBehavior = homing ? new HomingBehavior() : null;
    }

    override update(dt: number, world?: unknown): void {
        if (!world || !isBulletWorld(world)) return;

        this.ttl -= dt;

        if (this.ttl <= 0) {
            this.destroy();
            return;
        }

        this.homingBehavior?.update(this, world, dt);

        this.position = new Vector2(
            ((this.position.x + this.velocity.x * dt) % world.width
                + world.width) % world.width,
            ((this.position.y + this.velocity.y * dt) % world.height
                + world.height) % world.height
        );
    }

    render(ctx: CanvasRenderingContext2D): void {
        ctx.fillStyle = this.homingBehavior ? "#ffdf70" : "#ffffff";

        ctx.beginPath();
        ctx.arc(
            this.position.x,
            this.position.y,
            this.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
}
