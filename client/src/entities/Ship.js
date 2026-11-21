
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
        this.networkId = null;
        this.networkControlled = false;

        this.angle = -Math.PI / 2;
        this.speed = 230;
        this.keys = new Set();
        this.cooldown = 0;

        // Згладжування корекції локального корабля.
        this.renderOffset = new Vector2(0, 0);
        this.renderAngleOffset = 0;
        this.smoothingDuration = 0.1;
        this.smoothingRemaining = 0;

        // Буфер серверних знімків віддаленого корабля.
        this.snapshotHistory = [];
    }

    get hp() {
        return this.#hp;
    }

    setNetworkState(state) {
        if (!state) return;

        this.networkId = state.id;

        this.position = new Vector2(
            Number(state.x),
            Number(state.y)
        );

        this.angle = Number(state.angle);
        this.#hp = Number(state.hp ?? this.#hp);
    }

    /**
     * Додає серверний знімок до історії корабля.
     */
    addNetworkSnapshot(state, tick) {
        if (
            !state ||
            !Number.isFinite(state.x) ||
            !Number.isFinite(state.y) ||
            !Number.isFinite(state.angle) ||
            !Number.isFinite(tick)
        ) {
            return;
        }

        const snapshot = {
            tick,
            x: state.x,
            y: state.y,
            angle: state.angle
        };

        // Якщо знімок із таким tick вже є — замінюємо його.
        const existingIndex = this.snapshotHistory.findIndex(
            item => item.tick === tick
        );

        if (existingIndex !== -1) {
            this.snapshotHistory[existingIndex] = snapshot;
        } else {
            this.snapshotHistory.push(snapshot);
        }

        // Сортування потрібне через можливе мережеве запізнення.
        this.snapshotHistory.sort((a, b) => a.tick - b.tick);

        // Зберігаємо не більше 12 останніх знімків.
        if (this.snapshotHistory.length > 12) {
            this.snapshotHistory =
                this.snapshotHistory.slice(-12);
        }

        this.#hp = Number(state.hp ?? this.#hp);

        // Початкова позиція — перший отриманий знімок.
        if (this.snapshotHistory.length === 1) {
            this.position = new Vector2(state.x, state.y);
            this.angle = state.angle;
        }
    }

    /**
     * Інтерполює позицію корабля між двома серверними знімками.
     */
    interpolateNetworkState(targetTick, width, height) {
        const history = this.snapshotHistory;

        if (history.length === 0) return;

        if (history.length === 1) {
            const state = history[0];

            this.position = new Vector2(state.x, state.y);
            this.angle = state.angle;

            return;
        }

        let before = history[0];
        let after = history[history.length - 1];

        // Шукаємо два знімки, між якими знаходиться targetTick.
        for (let i = 0; i < history.length - 1; i++) {
            if (
                history[i].tick <= targetTick &&
                history[i + 1].tick >= targetTick
            ) {
                before = history[i];
                after = history[i + 1];
                break;
            }
        }

        // Якщо цільовий час раніше першого знімка.
        if (targetTick <= history[0].tick) {
            before = history[0];
            after = history[0];
        }

        // Якщо цільовий час пізніше останнього знімка.
        if (targetTick >= history[history.length - 1].tick) {
            before = history[history.length - 1];
            after = before;
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

        // Найкоротший шлях між координатами з урахуванням меж поля.
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

        // Інтерполяція кута найкоротшим шляхом.
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

    setNetworkCorrection(offsetX, offsetY, angleOffset = 0) {
        this.renderOffset = new Vector2(offsetX, offsetY);
        this.renderAngleOffset = angleOffset;

        this.smoothingRemaining = this.smoothingDuration;
    }

    updateNetworkSmoothing(dt) {
        if (this.smoothingRemaining <= 0) {
            this.renderOffset = new Vector2(0, 0);
            this.renderAngleOffset = 0;
            return;
        }

        const factor = Math.min(
            1,
            dt / this.smoothingRemaining
        );

        this.renderOffset = this.renderOffset.multiply(
            1 - factor
        );

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

    takeDamage(amount) {
        this.#hp = Math.max(0, this.#hp - amount);

        if (this.#hp === 0) {
            this.destroy();
        }
    }

    heal(amount) {
        this.#hp = Math.min(100, this.#hp + amount);
    }

    update(dt, world) {
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

    fire(world, homing = false) {
        if (this.dead || this.cooldown > 0) return;

        this.cooldown = 0.25;

        const direction = Vector2.fromAngle(this.angle);

        const nose = this.position.add(
            direction.multiply(this.radius + 5)
        );

        world.spawn(
            new Bullet(
                nose,
                direction.multiply(420),
                this.id,
                homing
            )
        );
    }

    render(ctx) {
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
