
import {
    createShipState,
    applyShipInput,
    stepShip,
    SHIP_CONFIG
} from "../../../shared/ShipSimulation.js";

import { Vector2 } from "../../../shared/Vector2.js";
import {
    hashSeed,
    createSeededRandom
} from "../../../shared/Random.js";

const TICK_RATE = 30;
const FIXED_DT = 1 / TICK_RATE;

const WORLD_WIDTH = 1200;
const WORLD_HEIGHT = 800;

const MAX_INPUT_QUEUE = 120;

const ASTEROID_SPAWN_TICKS = 90;
const PICKUP_SPAWN_TICKS = 360;

const BULLET_SPEED = 420;
const BULLET_RADIUS = 4;
const BULLET_TTL = 2;

export class GameSimulation {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = new Map();

        this.asteroids = new Map();
        this.pickups = new Map();
        this.bullets = new Map();

        this.tick = 0;
        this.nextEntityId = 1;

        this.random = createSeededRandom(hashSeed(roomId));

        this.running = false;
        this.timer = null;
        this.nextTickTime = 0;

        // Початкові метеорити.
        for (let i = 0; i < 8; i++) {
            this.spawnAsteroid();
        }
    }

    randomBetween(min, max) {
        return min + this.random() * (max - min);
    }

    wrap(value, size) {
        return (value + size) % size;
    }

    distance(a, b) {
        let dx = Math.abs(a.x - b.x);
        let dy = Math.abs(a.y - b.y);

        dx = Math.min(dx, WORLD_WIDTH - dx);
        dy = Math.min(dy, WORLD_HEIGHT - dy);

        return Math.hypot(dx, dy);
    }

    addPlayer(playerId) {
        if (this.players.has(playerId)) return;

        const index = this.players.size;

        const ship = createShipState(
            playerId,
            300 + index * 500,
            400
        );

        this.players.set(playerId, {
            ship,
            lastReceivedSeq: 0,
            lastProcessedSeq: 0,
            inputQueue: []
        });
    }

    removePlayer(playerId) {
        this.players.delete(playerId);

        for (const [id, bullet] of this.bullets) {
            if (bullet.ownerId === playerId) {
                this.bullets.delete(id);
            }
        }
    }

    handleInput(playerId, input) {
        const player = this.players.get(playerId);

        if (!player || !input) return false;

        if (
            !Number.isInteger(input.seq) ||
            input.seq <= player.lastReceivedSeq
        ) {
            return false;
        }

        if (
            !Number.isFinite(input.throttle) ||
            !Number.isFinite(input.turn) ||
            typeof input.shoot !== "boolean"
        ) {
            return false;
        }

        if (player.inputQueue.length >= MAX_INPUT_QUEUE) {
            return false;
        }

        const command = {
            seq: input.seq,
            throttle: Math.max(-1, Math.min(1, input.throttle)),
            turn: Math.max(-1, Math.min(1, input.turn)),
            shoot: input.shoot
        };

        player.inputQueue.push(command);
        player.lastReceivedSeq = command.seq;

        return true;
    }

    spawnAsteroid(x = null, y = null, radius = 28, velocity = null) {
        const angle = this.randomBetween(0, Math.PI * 2);
        const speed = this.randomBetween(25, 70);

        const asteroid = {
            id: `asteroid-${this.nextEntityId++}`,
            x: x ?? this.randomBetween(0, WORLD_WIDTH),
            y: y ?? this.randomBetween(0, WORLD_HEIGHT),
            vx: velocity?.x ?? Math.cos(angle) * speed,
            vy: velocity?.y ?? Math.sin(angle) * speed,
            radius,
            kind: "asteroid"
        };

        this.asteroids.set(asteroid.id, asteroid);
        return asteroid;
    }

    spawnPickup() {
        const pickup = {
            id: `pickup-${this.nextEntityId++}`,
            x: this.randomBetween(30, WORLD_WIDTH - 30),
            y: this.randomBetween(30, WORLD_HEIGHT - 30),
            radius: 12,
            kind: "pickup"
        };

        this.pickups.set(pickup.id, pickup);
        return pickup;
    }

    spawnBullet(ship) {
        const direction = Vector2.fromAngle(ship.angle);

        const nose = new Vector2(ship.x, ship.y).add(
            direction.multiply(SHIP_CONFIG.radius + 5)
        );

        const bullet = {
            id: `bullet-${this.nextEntityId++}`,
            ownerId: ship.id,
            x: nose.x,
            y: nose.y,
            vx: direction.x * BULLET_SPEED,
            vy: direction.y * BULLET_SPEED,
            radius: BULLET_RADIUS,
            ttl: BULLET_TTL,
            kind: "bullet"
        };

        this.bullets.set(bullet.id, bullet);
    }

    splitAsteroid(asteroid) {
        if (asteroid.radius > 20) {
            for (let i = 0; i < 2; i++) {
                const angle = this.randomBetween(0, Math.PI * 2);

                const velocity = {
                    x: Math.cos(angle) * 65,
                    y: Math.sin(angle) * 65
                };

                this.spawnAsteroid(
                    asteroid.x,
                    asteroid.y,
                    asteroid.radius * 0.55,
                    velocity
                );
            }
        }

        this.asteroids.delete(asteroid.id);
    }

    
    updatePlayers() {
        for (const player of this.players.values()) {
            // За один серверний такт обробляємо не більше
            // однієї команди від кожного гравця.
            if (player.inputQueue.length > 0) {
                const input = player.inputQueue.shift();

                applyShipInput(player.ship, input);
                player.lastProcessedSeq = input.seq;
            }

            const ship = player.ship;

            stepShip(
                ship,
                FIXED_DT,
                WORLD_WIDTH,
                WORLD_HEIGHT
            );

            if (ship.shoot && ship.cooldown <= 0 && ship.hp > 0) {
                this.spawnBullet(ship);
                ship.cooldown = SHIP_CONFIG.cooldown;
            }
        }
    }


    updateAsteroids() {
        for (const asteroid of this.asteroids.values()) {
            asteroid.x = this.wrap(
                asteroid.x + asteroid.vx * FIXED_DT,
                WORLD_WIDTH
            );

            asteroid.y = this.wrap(
                asteroid.y + asteroid.vy * FIXED_DT,
                WORLD_HEIGHT
            );
        }
    }

    updateBullets() {
        for (const bullet of this.bullets.values()) {
            bullet.ttl -= FIXED_DT;

            if (bullet.ttl <= 0) {
                this.bullets.delete(bullet.id);
                continue;
            }

            bullet.x = this.wrap(
                bullet.x + bullet.vx * FIXED_DT,
                WORLD_WIDTH
            );

            bullet.y = this.wrap(
                bullet.y + bullet.vy * FIXED_DT,
                WORLD_HEIGHT
            );
        }
    }

    checkCollisions() {
        // Кулі проти метеоритів і кораблів.
        for (const bullet of [...this.bullets.values()]) {
            if (!this.bullets.has(bullet.id)) continue;

            let hit = false;

            for (const asteroid of [...this.asteroids.values()]) {
                if (
                    this.distance(bullet, asteroid) <=
                    bullet.radius + asteroid.radius
                ) {
                    this.bullets.delete(bullet.id);
                    this.splitAsteroid(asteroid);
                    hit = true;
                    break;
                }
            }

            if (hit) continue;

            for (const [playerId, player] of this.players) {
                const ship = player.ship;

                if (
                    playerId === bullet.ownerId ||
                    ship.hp <= 0
                ) {
                    continue;
                }

                if (
                    this.distance(bullet, ship) <=
                    bullet.radius + SHIP_CONFIG.radius
                ) {
                    ship.hp = Math.max(0, ship.hp - 25);
                    this.bullets.delete(bullet.id);
                    break;
                }
            }
        }

        // Кораблі проти метеоритів.
        for (const player of this.players.values()) {
            const ship = player.ship;

            if (ship.hp <= 0) continue;

            for (const asteroid of [...this.asteroids.values()]) {
                if (
                    this.distance(ship, asteroid) <=
                    SHIP_CONFIG.radius + asteroid.radius
                ) {
                    ship.hp = Math.max(0, ship.hp - 20);
                    this.asteroids.delete(asteroid.id);
                }
            }
        }

        // Підбір аптечок.
        for (const player of this.players.values()) {
            const ship = player.ship;

            if (ship.hp <= 0) continue;

            for (const pickup of [...this.pickups.values()]) {
                if (
                    this.distance(ship, pickup) <=
                    SHIP_CONFIG.radius + pickup.radius
                ) {
                    ship.hp = Math.min(100, ship.hp + 25);
                    this.pickups.delete(pickup.id);
                }
            }
        }
    }

    step() {
        this.updatePlayers();
        this.updateAsteroids();
        this.updateBullets();

        this.checkCollisions();

        if (this.tick > 0 && this.tick % ASTEROID_SPAWN_TICKS === 0) {
            if (this.asteroids.size < 20) {
                this.spawnAsteroid();
            }
        }

        if (this.tick > 0 && this.tick % PICKUP_SPAWN_TICKS === 0) {
            if (this.pickups.size < 5) {
                this.spawnPickup();
            }
        }

        this.tick++;
    }

    createSnapshot() {
        return {
            type: "snapshot",
            roomId: this.roomId,
            tick: this.tick,
            serverTime: Date.now(),

            players: [...this.players.values()].map(player => ({
                id: player.ship.id,
                seq: player.lastProcessedSeq,
                x: player.ship.x,
                y: player.ship.y,
                angle: player.ship.angle,
                hp: player.ship.hp
            })),

            asteroids: [...this.asteroids.values()].map(item => ({
                id: item.id,
                x: item.x,
                y: item.y,
                radius: item.radius
            })),

            pickups: [...this.pickups.values()].map(item => ({
                id: item.id,
                x: item.x,
                y: item.y,
                radius: item.radius
            })),

            bullets: [...this.bullets.values()].map(item => ({
                id: item.id,
                ownerId: item.ownerId,
                x: item.x,
                y: item.y
            }))
        };
    }

    start(broadcast) {
        if (this.running) return;

        this.running = true;
        this.nextTickTime = performance.now();

        const loop = () => {
            if (!this.running) return;

            const now = performance.now();

            while (now >= this.nextTickTime) {
                this.step();
                this.nextTickTime += FIXED_DT * 1000;
            }

            broadcast(this.createSnapshot());

            const delay = Math.max(
                0,
                this.nextTickTime - performance.now()
            );

            this.timer = setTimeout(loop, delay);
        };

        loop();
    }

    stop() {
        this.running = false;

        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
