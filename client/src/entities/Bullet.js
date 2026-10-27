
import { Entity } from "./Entity.js";
import { Vector2 } from "./Vector2.js";

class HomingBehavior {
    constructor(turnRate = 3) {
        this.turnRate = turnRate;
    }

    update(bullet, world, dt) {
        let target = null;
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

export class Bullet extends Entity {
    constructor(position, velocity, ownerId, homing = false) {
        super({
            position,
            velocity,
            radius: 4,
            kind: "bullet"
        });

        this.ownerId = ownerId;
        this.ttl = 2.0;
        this.speed = velocity.length;
        this.homingBehavior = homing ? new HomingBehavior() : null;
    }

    update(dt, world) {
        this.ttl -= dt;

        if (this.ttl <= 0) {
            this.destroy();
            return;
        }

        if (this.homingBehavior) {
            this.homingBehavior.update(this, world, dt);
        }

        super.update(dt);

        this.position = new Vector2(
            (this.position.x + world.width) % world.width,
            (this.position.y + world.height) % world.height
        );
    }

    render(ctx) {
        ctx.fillStyle = this.homingBehavior ? "#ffdf70" : "#ffffff";
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}
