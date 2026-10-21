
import { Entity } from "./Entity.js";
import { Vector2 } from "./Vector2.js";
import { Bullet } from "./Bullet.js";

export class Ship extends Entity {
    #hp = 100;

    constructor(position, isPlayer = false) {
        super({
            position,
            radius: 16,
            kind: "ship"
        });

        this.isPlayer = isPlayer;
        this.angle = -Math.PI / 2;
        this.speed = 230;
        this.keys = new Set();
        this.cooldown = 0;
    }

    get hp() {
        return this.#hp;
    }

    takeDamage(amount) {
        this.#hp = Math.max(0, this.#hp - amount);
        if (this.#hp === 0) this.destroy();
    }

    heal(amount) {
        this.#hp = Math.min(100, this.#hp + amount);
    }

    update(dt, world) {
        if (this.dead) return;

        this.cooldown = Math.max(0, this.cooldown - dt);

        if (this.isPlayer) {
            let dx = 0;
            let dy = 0;

            if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy--;
            if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy++;
            if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx--;
            if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx++;

            const direction = new Vector2(dx, dy).normalize();
            this.position = this.position.add(
                direction.multiply(this.speed * dt)
            );

            if (dx !== 0 || dy !== 0) {
                this.angle = Math.atan2(dy, dx);
            }
        }

        super.update(dt);

        this.position = new Vector2(
            (this.position.x + world.width) % world.width,
            (this.position.y + world.height) % world.height
        );
    }

    fire(world, homing = false) {
        if (this.dead || this.cooldown > 0) return;

        this.cooldown = 0.25;

        const direction = Vector2.fromAngle(this.angle);
        const nose = this.position.add(
            direction.multiply(this.radius + 5)
        );

        world.spawn(new Bullet(nose, direction.multiply(420), this.id, homing));
    }

    render(ctx) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = this.isPlayer ? "#65e6ff" : "#ff8a65";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -11);
        ctx.lineTo(-7, 0);
        ctx.lineTo(-12, 11);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();

        if (this.isPlayer) {
            ctx.fillStyle = "#65e6ff";
            ctx.font = "12px Arial";
            ctx.fillText(`HP: ${this.hp}`, 12, 20);
        }
    }
}
