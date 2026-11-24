import { Vector2 } from "./Vector2.ts";

export interface EntityOptions {
    position?: Vector2;
    velocity?: Vector2;
    radius?: number;
    kind?: string;
}

export class Entity {
    static #id = 0;

    readonly id: number;
    position: Vector2;
    velocity: Vector2;
    radius: number;
    kind: string;
    dead: boolean;

    constructor({
        position = new Vector2(),
        velocity = new Vector2(),
        radius = 10,
        kind = "entity"
    }: EntityOptions = {}) {
        this.id = ++Entity.#id;
        this.position = position;
        this.velocity = velocity;
        this.radius = radius;
        this.kind = kind;
        this.dead = false;
    }

    update(dt: number, _world?: unknown): void {
        void _world;

        this.position = new Vector2(
            this.position.x + this.velocity.x * dt,
            this.position.y + this.velocity.y * dt
        );
    }

    destroy(): void {
        this.dead = true;
    }
}
