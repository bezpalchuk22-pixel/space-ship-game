
import { Vector2 } from "./Vector2.js";

export const SHIP_CONFIG = Object.freeze({
    speed: 230,
    rotationSpeed: 3.5,
    radius: 16,
    cooldown: 0.25
});

/**
 * Створює початковий стан корабля.
 */
export function createShipState(id, x, y) {
    return {
        id,
        x,
        y,
        angle: -Math.PI / 2,
        vx: 0,
        vy: 0,
        throttle: 0,
        turn: 0,
        shoot: false,
        cooldown: 0,
        hp: 100
    };
}

/**
 * Застосовує команди гравця.
 * throttle: -1 або 1
 * turn: -1 або 1
 */
export function applyShipInput(ship, input) {
    ship.throttle = Math.max(-1, Math.min(1, input.throttle ?? 0));
    ship.turn = Math.max(-1, Math.min(1, input.turn ?? 0));
    ship.shoot = Boolean(input.shoot);
}

/**
 * Детермінований крок симуляції корабля.
 */
export function stepShip(ship, dt, worldWidth, worldHeight) {
    ship.angle += ship.turn * SHIP_CONFIG.rotationSpeed * dt;

    const direction = Vector2.fromAngle(ship.angle);

    ship.vx = direction.x * ship.throttle * SHIP_CONFIG.speed;
    ship.vy = direction.y * ship.throttle * SHIP_CONFIG.speed;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    ship.x = (ship.x + worldWidth) % worldWidth;
    ship.y = (ship.y + worldHeight) % worldHeight;

    ship.cooldown = Math.max(0, ship.cooldown - dt);
}
