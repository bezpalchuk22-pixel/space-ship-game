
import { Vector2 } from "./Vector2.ts";
import { Ship } from "./Ship.ts";
import { Asteroid } from "./Asteroid.ts";
import { Pickup } from "./Pickup.ts";
import { Particle } from "./Particle.ts";
import { CollisionSystem } from "./CollisionSystem.ts";
import { Bullet } from "./Bullet.ts";

import {
    createShipState,
    applyShipInput,
    stepShip
} from "../../../shared/ShipSimulation.ts";

import {
    toPlayerId
} from "../../../shared/Types.ts";

import type {
    PlayerId,
    GameSnapshot,
    ShipInput
} from "../../../shared/Types.ts";

import type {
    InputPacket
} from "../../../shared/BinaryProtocol.ts";

import type {
    Entity
} from "./Entity.ts";

interface NetworkEntity extends Entity {
    networkId?: string;
    networkControlled?: boolean;
}

function isNetworkControlled(
    entity: Entity
): entity is Entity & { networkControlled: boolean } {
    return (
        "networkControlled" in entity &&
        typeof entity.networkControlled === "boolean"
    );
}

export class World {
    readonly width: number;
    readonly height: number;

    entities = new Map<number, Entity>();
    collisionSystem = new CollisionSystem();

    score = 0;
    player: Ship | null = null;

    networkShips = new Map<string, Ship>();
    networkEntities = new Map<string, NetworkEntity>();

    networkMode = false;
    respawnTimer = 0;

    localPredictionState: ReturnType<typeof createShipState> | null = null;

    latestSnapshotTick = 0;
    interpolationDelayTicks = 3;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    spawn<T extends Entity>(entity: T): T {
        this.entities.set(entity.id, entity);

        if (entity instanceof Ship && entity.isPlayer) {
            this.player = entity;
        }

        return entity;
    }

    despawn(entity: Entity): void {
        entity.destroy();
    }

    *ofKind(kind: string): IterableIterator<Entity> {
        for (const entity of this.entities.values()) {
            if (entity.kind === kind && !entity.dead) {
                yield entity;
            }
        }
    }

    explode(position: Vector2, count = 12): void {
        for (let i = 0; i < count; i++) {
            this.spawn(new Particle(position));
        }
    }

    spawnAsteroid(): void {
        const position = new Vector2(
            Math.random() * this.width,
            Math.random() * this.height
        );

        this.spawn(new Asteroid(position));
    }

    spawnPickup(): void {
        const position = new Vector2(
            Math.random() * this.width,
            Math.random() * this.height
        );

        this.spawn(new Pickup(position));
    }

    setNetworkMode(enabled = true): void {
        this.networkMode = enabled;

        for (const ship of this.networkShips.values()) {
            ship.networkControlled = enabled;
        }

        for (const entity of this.networkEntities.values()) {
            entity.networkControlled = enabled;
        }
    }

    predictNetworkInput(input: ShipInput): void {
        const ship = this.player;

        if (!ship || ship.dead || !ship.networkId) {
            return;
        }

        if (!this.localPredictionState) {
            this.localPredictionState = createShipState(
                toPlayerId(ship.networkId),
                ship.position.x,
                ship.position.y
            );

            this.localPredictionState.angle = ship.angle;
            this.localPredictionState.hp = ship.hp;
        }

        applyShipInput(this.localPredictionState, input);

        stepShip(
            this.localPredictionState,
            1 / 30,
            this.width,
            this.height
        );

        ship.position = new Vector2(
            this.localPredictionState.x,
            this.localPredictionState.y
        );

        ship.angle = this.localPredictionState.angle;
    }

    applyNetworkSnapshot(
        snapshot: GameSnapshot | null | undefined,
        playerId: string,
        pendingInputs: readonly InputPacket[] = []
    ): void {
        if (!snapshot || !Array.isArray(snapshot.players)) {
            return;
        }

        this.latestSnapshotTick = Math.max(
            this.latestSnapshotTick,
            snapshot.tick
        );

        this.setNetworkMode(true);

        const activeShipIds = new Set<string>();

        let localShip: Ship | null = null;
        let localServerState: GameSnapshot["players"][number] | null = null;
        let previousLocalPosition: Vector2 | null = null;
        let previousLocalAngle: number | null = null;

        // Синхронізація кораблів гравців.
        for (const state of snapshot.players) {
            if (
                !state.id ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y) ||
                !Number.isFinite(state.angle)
            ) {
                continue;
            }

            activeShipIds.add(state.id);

            let ship = this.networkShips.get(state.id);

            if (!ship) {
                ship = new Ship(
                    new Vector2(state.x, state.y),
                    state.id === playerId
                );

                ship.networkId = state.id;
                ship.networkControlled = true;

                this.networkShips.set(state.id, ship);
                this.spawn(ship);
            }

            ship.isPlayer = state.id === playerId;
            ship.networkControlled = true;

            if (ship.isPlayer) {
                previousLocalPosition = new Vector2(
                    ship.position.x,
                    ship.position.y
                );

                previousLocalAngle = ship.angle;

                ship.setNetworkState(state);

                this.player = ship;
                localShip = ship;
                localServerState = state;
            } else {
                ship.addNetworkSnapshot(
                    state,
                    snapshot.tick
                );
            }
        }

        // Видалення кораблів, яких більше немає на сервері.
        for (const [id, ship] of this.networkShips) {
            if (!activeShipIds.has(id)) {
                ship.destroy();
                this.networkShips.delete(id);

                if (this.player === ship) {
                    this.player = null;
                }
            }
        }

        // Узгодження локального прогнозу із серверним станом.
        if (localShip && localServerState) {
            const acknowledgedSeq = localServerState.seq;

            const predicted = createShipState(
                localServerState.id,
                localServerState.x,
                localServerState.y
            );

            predicted.angle = localServerState.angle;
            predicted.hp = localServerState.hp;

            // Повторно застосовуємо непідтверджені команди.
            const unacknowledgedInputs = pendingInputs
                .filter(input => input.seq > acknowledgedSeq)
                .sort((a, b) => a.seq - b.seq);

            for (const input of unacknowledgedInputs) {
                applyShipInput(predicted, input);

                stepShip(
                    predicted,
                    1 / 30,
                    this.width,
                    this.height
                );
            }

            this.localPredictionState = predicted;

            localShip.position = new Vector2(
                predicted.x,
                predicted.y
            );

            localShip.angle = predicted.angle;

            // Згладжування різниці між прогнозом і сервером.
            if (previousLocalPosition) {
                let offsetX =
                    previousLocalPosition.x - predicted.x;

                let offsetY =
                    previousLocalPosition.y - predicted.y;

                if (offsetX > this.width / 2) {
                    offsetX -= this.width;
                }

                if (offsetX < -this.width / 2) {
                    offsetX += this.width;
                }

                if (offsetY > this.height / 2) {
                    offsetY -= this.height;
                }

                if (offsetY < -this.height / 2) {
                    offsetY += this.height;
                }

                let angleOffset = 0;

                if (previousLocalAngle !== null) {
                    angleOffset =
                        previousLocalAngle - predicted.angle;

                    while (angleOffset > Math.PI) {
                        angleOffset -= Math.PI * 2;
                    }

                    while (angleOffset < -Math.PI) {
                        angleOffset += Math.PI * 2;
                    }
                }

                localShip.setNetworkCorrection(
                    offsetX,
                    offsetY,
                    angleOffset
                );
            }
        }

        // Синхронізація астероїдів.
        const activeEntityIds = new Set<string>();

        for (const state of snapshot.asteroids) {
            if (
                !state.id ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y)
            ) {
                continue;
            }

            activeEntityIds.add(state.id);

            let entity = this.networkEntities.get(state.id);

            if (!entity) {
                entity = Object.assign(
                    new Asteroid(
                        new Vector2(state.x, state.y),
                        state.radius,
                        new Vector2()
                    ),
                    {
                        networkId: state.id,
                        networkControlled: true
                    }
                );

                this.networkEntities.set(state.id, entity);
                this.spawn(entity);
            }

            entity.position = new Vector2(state.x, state.y);
            entity.radius = state.radius;
        }

        // Синхронізація аптечок.
        for (const state of snapshot.pickups) {
            if (
                !state.id ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y)
            ) {
                continue;
            }

            activeEntityIds.add(state.id);

            let entity = this.networkEntities.get(state.id);

            if (!entity) {
                entity = Object.assign(
                    new Pickup(
                        new Vector2(state.x, state.y)
                    ),
                    {
                        networkId: state.id,
                        networkControlled: true
                    }
                );

                this.networkEntities.set(state.id, entity);
                this.spawn(entity);
            }

            entity.position = new Vector2(state.x, state.y);
            entity.radius = state.radius;
        }

        // Синхронізація куль.
        for (const state of snapshot.bullets) {
            if (
                !state.id ||
                !Number.isFinite(state.x) ||
                !Number.isFinite(state.y)
            ) {
                continue;
            }

            activeEntityIds.add(state.id);

            let entity = this.networkEntities.get(state.id);

            if (!entity) {
                entity = Object.assign(
                    new Bullet(
                        new Vector2(state.x, state.y),
                        new Vector2(),
                        state.ownerId
                    ),
                    {
                        networkId: state.id,
                        networkControlled: true
                    }
                );

                this.networkEntities.set(state.id, entity);
                this.spawn(entity);
            }

            entity.position = new Vector2(state.x, state.y);
        }

        // Видалення об'єктів, яких більше немає на сервері.
        for (const [id, entity] of this.networkEntities) {
            if (!activeEntityIds.has(id)) {
                entity.destroy();
                this.networkEntities.delete(id);
            }
        }

        // Очищення знищених об'єктів.
        for (const [id, entity] of this.entities) {
            if (entity.dead) {
                this.entities.delete(id);
            }
        }
    }

    step(dt: number): void {
        // Відродження гравця в одиночному режимі.
        if (!this.networkMode) {
            if (this.player?.dead && this.respawnTimer <= 0) {
                this.respawnTimer = 2;
            }

            if (!this.player || this.player.dead) {
                this.respawnTimer -= dt;

                if (this.respawnTimer <= 0) {
                    this.spawn(
                        new Ship(
                            new Vector2(
                                this.width / 2,
                                this.height / 2
                            ),
                            true
                        )
                    );

                    this.respawnTimer = 0;
                }
            }
        }

        const currentEntities = [...this.entities.values()];

        for (const entity of currentEntities) {
            if (entity.dead) {
                continue;
            }

            // Інтерполяція мережевих кораблів.
            if (
                this.networkMode &&
                entity instanceof Ship &&
                entity.networkControlled
            ) {
                if (entity.isPlayer) {
                    entity.updateNetworkSmoothing(dt);
                } else {
                    const targetTick =
                        this.latestSnapshotTick -
                        this.interpolationDelayTicks;

                    entity.interpolateNetworkState(
                        targetTick,
                        this.width,
                        this.height
                    );
                }
            }

            // Мережеві об'єкти оновлюються сервером.
            if (
                this.networkMode &&
                isNetworkControlled(entity) &&
                entity.networkControlled
            ) {
                continue;
            }

            entity.update(dt, this);
        }

        // Локальні зіткнення не змінюють серверний стан.
        if (!this.networkMode) {
            this.collisionSystem.check(this);
        }

        // Видалення знищених об'єктів.
        for (const [id, entity] of this.entities) {
            if (entity.dead) {
                this.entities.delete(id);
            }
        }
    }

    render(ctx: CanvasRenderingContext2D): void {
        for (const entity of this.entities.values()) {
            if (
                !entity.dead &&
                "render" in entity &&
                typeof entity.render === "function"
            ) {
                entity.render(ctx);
            }
        }
    }
}
