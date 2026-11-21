
import { Vector2 } from "./Vector2.js";
import { Ship } from "./Ship.js";
import { Asteroid } from "./Asteroid.js";
import { Pickup } from "./Pickup.js";
import { Particle } from "./Particle.js";
import { CollisionSystem } from "./CollisionSystem.js";
import { Bullet } from "./Bullet.js";
import {
    createShipState,
    applyShipInput,
    stepShip
} from "../../../shared/ShipSimulation.js";

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        this.entities = new Map();
        this.collisionSystem = new CollisionSystem();

        this.score = 0;
        this.player = null;

        this.networkShips = new Map();
        this.networkEntities = new Map();

        this.networkMode = false;
        this.respawnTimer = 0;
        this.localPredictionState = null;

        // Налаштування інтерполяції віддалених гравців.
        this.latestSnapshotTick = 0;
        this.interpolationDelayTicks = 3;
    }

    spawn(entity) {
        this.entities.set(entity.id, entity);

        if (entity.kind === "ship" && entity.isPlayer) {
            this.player = entity;
        }

        return entity;
    }

    despawn(entity) {
        entity.destroy();
    }

    *ofKind(kind) {
        for (const entity of this.entities.values()) {
            if (entity.kind === kind && !entity.dead) {
                yield entity;
            }
        }
    }

    explode(position, count = 12) {
        for (let i = 0; i < count; i++) {
            this.spawn(new Particle(position));
        }
    }

    spawnAsteroid() {
        const position = new Vector2(
            Math.random() * this.width,
            Math.random() * this.height
        );

        this.spawn(new Asteroid(position));
    }

    spawnPickup() {
        this.spawn(
            new Pickup(
                new Vector2(
                    Math.random() * this.width,
                    Math.random() * this.height
                )
            )
        );
    }

    setNetworkMode(enabled = true) {
        this.networkMode = enabled;

        for (const ship of this.networkShips.values()) {
            ship.networkControlled = enabled;
        }

        for (const entity of this.networkEntities.values()) {
            entity.networkControlled = enabled;
        }
    }

    predictNetworkInput(input) {
        const ship = this.player;

        if (!ship || ship.dead || !ship.networkId) return;

        if (!this.localPredictionState) {
            this.localPredictionState = createShipState(
                ship.networkId,
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

    applyNetworkSnapshot(snapshot, playerId, pendingInputs = []) {
        if (!snapshot || !Array.isArray(snapshot.players)) {
            return;
        }

        // Запам'ятовуємо номер останнього серверного тика.
        if (Number.isFinite(snapshot.tick)) {
            this.latestSnapshotTick = Math.max(
                this.latestSnapshotTick,
                snapshot.tick
            );
        }

        this.setNetworkMode(true);

        const activeShipIds = new Set();

        let localShip = null;
        let localServerState = null;
        let previousLocalPosition = null;
        let previousLocalAngle = null;

        // Синхронізація кораблів гравців.
        for (const state of snapshot.players) {
            if (
                !state ||
                typeof state.id !== "string" ||
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

                // Локальний корабель синхронізується напряму.
                ship.setNetworkState(state);

                this.player = ship;
                localShip = ship;
                localServerState = state;
            } else {
                // Віддалений корабель додає знімок до буфера.
                ship.addNetworkSnapshot(
                    state,
                    Number.isFinite(snapshot.tick)
                        ? snapshot.tick
                        : 0
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
            const acknowledgedSeq = Number.isInteger(localServerState.seq)
                ? localServerState.seq
                : 0;

            const predicted = createShipState(
                localServerState.id,
                localServerState.x,
                localServerState.y
            );

            predicted.angle = localServerState.angle;
            predicted.hp = localServerState.hp ?? 100;

            // Повторно застосовуємо лише непідтверджені команди.
            const unacknowledgedInputs = pendingInputs
                .filter(input =>
                    Number.isInteger(input.seq) &&
                    input.seq > acknowledgedSeq
                )
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
                let offsetX = previousLocalPosition.x - predicted.x;
                let offsetY = previousLocalPosition.y - predicted.y;

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

                if (Number.isFinite(previousLocalAngle)) {
                    angleOffset = previousLocalAngle - predicted.angle;

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

        // Синхронізація астероїдів, аптечок і куль.
        const collections = [
            {
                states: snapshot.asteroids ?? [],
                create: state => new Asteroid(
                    new Vector2(state.x, state.y),
                    state.radius,
                    new Vector2()
                )
            },
            {
                states: snapshot.pickups ?? [],
                create: state => new Pickup(
                    new Vector2(state.x, state.y)
                )
            },
            {
                states: snapshot.bullets ?? [],
                create: state => new Bullet(
                    new Vector2(state.x, state.y),
                    new Vector2(),
                    state.ownerId
                )
            }
        ];

        const activeEntityIds = new Set();

        for (const collection of collections) {
            for (const state of collection.states) {
                if (
                    !state ||
                    typeof state.id !== "string" ||
                    !Number.isFinite(state.x) ||
                    !Number.isFinite(state.y)
                ) {
                    continue;
                }

                activeEntityIds.add(state.id);

                let entity = this.networkEntities.get(state.id);

                if (!entity) {
                    entity = collection.create(state);

                    entity.networkId = state.id;
                    entity.networkControlled = true;

                    this.networkEntities.set(state.id, entity);
                    this.spawn(entity);
                }

                entity.position = new Vector2(
                    state.x,
                    state.y
                );

                if (Number.isFinite(state.radius)) {
                    entity.radius = state.radius;
                }
            }
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

    step(dt) {
        // Відродження гравця працює лише в одиночному режимі.
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

            // Інтерполяція віддалених кораблів.
            if (
                this.networkMode &&
                entity.kind === "ship" &&
                entity.networkControlled
            ) {
                if (entity.isPlayer) {
                    // Згладжування корекції локального корабля.
                    entity.updateNetworkSmoothing(dt);
                } else {
                    // Відображаємо стан із затримкою у 3 серверні тики.
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

            // У мережевому режимі мережеві об'єкти
            // оновлюються сервером.
            if (
                this.networkMode &&
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

    render(ctx) {
        for (const entity of this.entities.values()) {
            if (
                !entity.dead &&
                typeof entity.render === "function"
            ) {
                entity.render(ctx);
            }
        }
    }
}

