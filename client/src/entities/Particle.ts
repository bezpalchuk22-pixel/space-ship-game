
import { Entity } from "./Entity.ts";
import { Vector2 } from "./Vector2.ts";

export class Particle extends Entity {
    ttl: number;
    maxTtl: number;

    constructor(position: Vector2) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 130;

        super({
            position: new Vector2(position.x, position.y),
            velocity: Vector2.fromAngle(angle, speed),
            radius: 2,
            kind: "particle"
        });

        this.ttl = 0.45 + Math.random() * 0.55;
        this.maxTtl = this.ttl;
    }

    override update(dt: number): void {
        this.ttl -= dt;
        super.update(dt);

        if (this.ttl <= 0) {
            this.destroy();
        }
    }

    render(ctx: CanvasRenderingContext2D): void {
        ctx.globalAlpha = Math.max(0, this.ttl / this.maxTtl);
        ctx.fillStyle = "#ffca70";

        ctx.beginPath();
        ctx.arc(
            this.position.x,
            this.position.y,
            this.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();

        ctx.globalAlpha = 1;
    }
}
