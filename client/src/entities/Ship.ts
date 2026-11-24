
import { Entity } from "./Entity.ts";
import { Vector2 } from "./Vector2.ts";

interface ShipNetworkState {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly hp?: number;
}

interface NetworkSnapshot {
    readonly tick: number;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
}

interface ShipWorld {
    readonly width: number;
    readonly height: number;
    spawnBullet(position: Vector2, velocity: Vector2, ownerId: number | string, homing?: boolean): void;
}

export class Ship extends Entity {
    #hp = 100;

    isPlayer: boolean;
    networkId: string | null = null;
    networkControlled = false;

    angle = -Math.PI / 2;
    speed = 230;
    keys = new Set<string>();
    cooldown = 0;

    renderOffset = new Vector2(0, 0);
    renderAngleOffset = 0;
    smoothingDuration = 0.1;
    smoothingRemaining = 0;

    snapshotHistory: NetworkSnapshot[] = [];

    constructor(position: Vector2, isPlayer = false) {
        super({
            position,
            radius: 16,
            kind: "ship"
        });

        this.isPlayer = isPlayer;
    }

    get hp(): number {
        return this.#hp;
    }

    setNetworkState(state: ShipNetworkState | null | undefined): void {
        if (!state) return;

        this.networkId = state.id;

        this.position = new Vector2(
            Number(state.x),
            Number(state.y)
        );

        this.angle = Number(state.angle);
        this.#hp = Number(state.hp ?? this.#hp);
    }

    addNetworkSnapshot(
        state: ShipNetworkState | null | undefined,
        tick: number
    ): void {
        if (
            !state ||
            !Number.isFinite(state.x) ||
            !Number.isFinite(state.y) ||
            !Number.isFinite(state.angle) ||
            !Number.isFinite(tick)
        ) {
            return;
        }

        const snapshot: NetworkSnapshot = {
            tick,
            x: state.x,
            y: state.y,
            angle: state.angle
        };

        const existingIndex = this.snapshotHistory.findIndex(
            item => item.tick === tick
        );

        if (existingIndex !== -1) {
            this.snapshotHistory[existingIndex] = snapshot;
        } else {
            this.snapshotHistory.push(snapshot);
        }

        this.snapshotHistory.sort((a, b) => a.tick - b.tick);

        if (this.snapshotHistory.length > 12) {
            this.snapshotHistory = this.snapshotHistory.slice(-12);
        }

        this.#hp = Number(state.hp ?? this.#hp);

        if (this.snapshotHistory.length === 1) {
            this.position = new Vector2(state.x, state.y);
            this.angle = state.angle;
        }
    }

    interpolateNetworkState(
        targetTick: number,
        width: number,
        height: number
    ): void {
        const history = this.snapshotHistory;

        if (history.length === 0) return;

        if (history.length === 1) {
            const state = history[0];
            if (!state) return;

            this.position = new Vector2(state.x, state.y);
            this.angle = state.angle;
            return;
        }

        const first = history[0];
        const last = history[history.length - 1];

        if (!first || !last) return;

        let before = first;
        let after = last;

        for (let i = 0; i < history.length - 1; i++) {
            const current = history[i];
            const next = history[i + 1];

            if (
                current &&
                next &&
                current.tick <= targetTick &&
                next.tick >= targetTick
            ) {
                before = current;
                after = next;
                break;
            }
        }

        if (targetTick <= first.tick) {
            before = first;
            after = first;
        }

        if (targetTick >= last.tick) {
            before = last;
            after = last;
        }

        const tickDifference = after.tick - before.tick;

        const alpha = tickDifference > 0
            ? Math.max(
                0,
                Math.min(
                    1,
                    (targetTick - before.tick) / tickDifference
                )
            )
            : 0;

        let dx = after.x - before.x;
        let dy = after.y - before.y;

        if (dx > width / 2) dx -= width;
        if (dx < -width / 2) dx += width;

        if (dy > height / 2) dy -= height;
        if (dy < -height / 2) dy += height;

        let x = before.x + dx * alpha;
        let y = before.y + dy * alpha;

        x = ((x % width) + width) % width;
        y = ((y % height) + height) % height;

        let angleDifference = after.angle - before.angle;

        while (angleDifference > Math.PI) {
            angleDifference -= Math.PI * 2;
        }

        while (angleDifference < -Math.PI) {
            angleDifference += Math.PI * 2;
        }

        const angle = before.angle + angleDifference * alpha;

        this.position = new Vector2(x, y);
        this.angle = angle;
    }

    setNetworkCorrection(
        offsetX: number,
        offsetY: number,
        angleOffset = 0
    ): void {
        this.renderOffset = new Vector2(offsetX, offsetY);
        this.renderAngleOffset = angleOffset;
        this.smoothingRemaining = this.smoothingDuration;
    }

    updateNetworkSmoothing(dt: number): void {
        if (this.smoothingRemaining <= 0) {
            this.renderOffset = new Vector2(0, 0);
            this.renderAngleOffset = 0;
            return;
        }

        const factor = Math.min(
            1,
            dt / this.smoothingRemaining
        );

        this.renderOffset = this.renderOffset.multiply(1 - factor);
        this.renderAngleOffset *= 1 - factor;

        this.smoothingRemaining = Math.max(
            0,
            this.smoothingRemaining - dt
        );

        if (this.smoothingRemaining === 0) {
            this.renderOffset = new Vector2(0, 0);
            this.renderAngleOffset = 0;
        }
    }

    takeDamage(amount: number): void {
        this.#hp = Math.max(0, this.#hp - amount);

        if (this.#hp === 0) {
            this.destroy();
        }
    }

    heal(amount: number): void {
        this.#hp = Math.min(100, this.#hp + amount);
    }

    override update(dt: number, world: ShipWorld): void {
        if (this.dead) return;

        this.cooldown = Math.max(0, this.cooldown - dt);

        if (!this.networkControlled && this.isPlayer) {
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

        if (!this.networkControlled) {
            super.update(dt);

            this.position = new Vector2(
                (this.position.x + world.width) % world.width,
                (this.position.y + world.height) % world.height
            );
        }
    }

    fire(world: ShipWorld, homing = false): void {
        if (this.dead || this.cooldown > 0) return;

        this.cooldown = 0.25;

        const direction = Vector2.fromAngle(this.angle);

        const nose = this.position.add(
            direction.multiply(this.radius + 5)
        );

        world.spawnBullet(
            nose,
            direction.multiply(420),
            this.id,
            homing
        );
    }

    render(ctx: CanvasRenderingContext2D): void {
        const displayX = this.position.x + this.renderOffset.x;
        const displayY = this.position.y + this.renderOffset.y;
        const displayAngle = this.angle + this.renderAngleOffset;

        ctx.save();

        ctx.translate(displayX, displayY);
        ctx.rotate(displayAngle);

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
