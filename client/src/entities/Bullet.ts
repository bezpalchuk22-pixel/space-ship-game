
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
            if (entity.kind !== "asteroid" || entity.dead) {
                continue;
            }

            const distance = bullet.position.distanceTo(entity.position);

            if (distance < bestDistance) {
                bestDistance = distance;
                target = entity;
            }
        }

        if (!target) return;

        const desired = target.position
            .subtract(bullet.position)
            .normalize();

        const current = bullet.velocity.normalize();
        const blend = Math.min(1, this.turnRate * dt);

        bullet.velocity = current
            .multiply(1 - blend)
            .add(desired.multiply(blend))
            .normalize()
            .multiply(bullet.speed);
    }
}
function isBulletWorld(value: unknown): value is BulletWorld {
    if (typeof value !== "object" || value === null) {
        return false;
    }

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
    readonly ownerId: number | string;
    ttl: number;
    readonly speed: number;
    private readonly homingBehavior: HomingBehavior | null;

    constructor(
        position: Vector2,
        velocity: Vector2,
        ownerId: number | string,
        homing: boolean = false
    ) {
        super({
            position,
            velocity,
            radius: 4,
            kind: "bullet"
        });

        this.ownerId = ownerId;
        this.ttl = 2.0;
        this.speed = velocity.length;
        this.homingBehavior = homing
            ? new HomingBehavior()
            : null;
    }


    override update(dt: number, world?: unknown): void {
        if (!world || !isBulletWorld(world)) {
            return;
        }

        this.ttl -= dt;

        if (this.ttl <= 0) {
            this.destroy();
            return;
        }

        this.homingBehavior?.update(this, world, dt);

        super.update(dt);

        this.position = new Vector2(
            (this.position.x + world.width) % world.width,
            (this.position.y + world.height) % world.height
        );
    }


    render(ctx: CanvasRenderingContext2D): void {
        ctx.fillStyle = this.homingBehavior
            ? "#ffdf70"
            : "#ffffff";

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

