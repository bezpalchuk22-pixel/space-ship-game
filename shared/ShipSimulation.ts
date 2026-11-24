
import { Vector2 } from "./Vector2.js";
import type { PlayerId, ShipInput } from "./Types.js";

export const SHIP_CONFIG = Object.freeze({
    speed: 230,
    rotationSpeed: 3.5,
    radius: 16,
    cooldown: 0.25
});

export interface ShipState {
    readonly id: PlayerId;
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    throttle: number;
    turn: number;
    shoot: boolean;
    cooldown: number;
    hp: number;
}

export function createShipState(
    id: PlayerId,
    x: number,
    y: number
): ShipState {
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

export function applyShipInput(
    ship: ShipState,
    input: ShipInput
): void {
    ship.throttle = Math.max(
        -1,
        Math.min(1, input.throttle)
    );

    ship.turn = Math.max(
        -1,
        Math.min(1, input.turn)
    );

    ship.shoot = input.shoot;
}

export function stepShip(
    ship: ShipState,
    dt: number,
    worldWidth: number,
    worldHeight: number
): void {
    ship.angle += ship.turn * SHIP_CONFIG.rotationSpeed * dt;

    const direction = Vector2.fromAngle(ship.angle);

    ship.vx = direction.x * ship.throttle * SHIP_CONFIG.speed;
    ship.vy = direction.y * ship.throttle * SHIP_CONFIG.speed;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;

    ship.x = ((ship.x % worldWidth) + worldWidth) % worldWidth;
    ship.y = ((ship.y % worldHeight) + worldHeight) % worldHeight;

    ship.cooldown = Math.max(0, ship.cooldown - dt);
}
