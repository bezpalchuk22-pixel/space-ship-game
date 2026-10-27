
import { Entity } from "./Entity.js";
import { Vector2 } from "./Vector2.js";

export class Pickup extends Entity {
    constructor(position) {
        super({
            position,
            velocity: new Vector2(),
            radius: 12,
            kind: "pickup"
        });
    }

    render(ctx) {
        ctx.strokeStyle = "#72f59b";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.position.x - 6, this.position.y);
        ctx.lineTo(this.position.x + 6, this.position.y);
        ctx.moveTo(this.position.x, this.position.y - 6);
        ctx.lineTo(this.position.x, this.position.y + 6);
        ctx.stroke();
    }
}
