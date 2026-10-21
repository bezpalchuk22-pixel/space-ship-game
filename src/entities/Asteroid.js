
import { Entity } from "./Entity.js";
import { Vector2 } from "./Vector2.js";

export class Asteroid extends Entity {
    constructor(position, radius = 28, velocity = null) {
        const speed = 25 + Math.random() * 45;
        const angle = Math.random() * Math.PI * 2;

        super({
            position,
            velocity: velocity ?? Vector2.fromAngle(angle, speed),
            radius,
            kind: "asteroid"
        });
    }

    update(dt, world) {
        super.update(dt);

        this.position = new Vector2(
            (this.position.x + world.width) % world.width,
            (this.position.y + world.height) % world.height
        );
    }

    split(world) {
        if (this.radius > 20) {
            for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                const velocity = Vector2.fromAngle(angle, 65);

                world.spawn(
                    new Asteroid(this.position, this.radius * 0.55, velocity)
                );
            }
        }

        this.destroy();
    }

    render(ctx) {
        ctx.strokeStyle = "#c3c8d3";
        ctx.lineWidth = 2;
        ctx.beginPath();

        const sides = 9;

        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const wobble = 0.78 + 0.22 * Math.sin(i * 4.3);
            const x = this.position.x + Math.cos(angle) * this.radius * wobble;
            const y = this.position.y + Math.sin(angle) * this.radius * wobble;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.stroke();
    }
}
