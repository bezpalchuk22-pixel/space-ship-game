
export type Brand<T, Name extends string> = T & {
    readonly __brand: Name;
};

export type EntityId = Brand<string, "EntityId">;
export type PlayerId = Brand<string, "PlayerId">;
export type Tick = Brand<number, "Tick">;
export type SequenceNumber = Brand<number, "SequenceNumber">;

export function toEntityId(value: string): EntityId {
    if (value.length === 0) {
        throw new TypeError("EntityId cannot be empty");
    }
    // Brand validated string as EntityId.
    return value as EntityId;
}

export function toPlayerId(value: string): PlayerId {
    if (value.length === 0) {
        throw new TypeError("PlayerId cannot be empty");
    }
    // Brand validated string as PlayerId.
    return value as PlayerId;
}

export function toTick(value: number): Tick {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError("Invalid tick");
    }
    // Brand validated string as Tick.
    return value as Tick;
}

export function toSequenceNumber(value: number): SequenceNumber {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
        throw new RangeError("Invalid sequence number");
    }
    // Brand validated string as SequenceNumber.
    return value as SequenceNumber;
}

export interface ShipInput {
    readonly throttle: number;
    readonly turn: number;
    readonly shoot: boolean;
}

export interface PlayerSnapshot {
    readonly kind: "player";
    readonly id: PlayerId;
    readonly seq: SequenceNumber;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly hp: number;
}

export interface AsteroidSnapshot {
    readonly kind: "asteroid";
    readonly id: EntityId;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
}

export interface PickupSnapshot {
    readonly kind: "pickup";
    readonly id: EntityId;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
}

export interface BulletSnapshot {
    readonly kind: "bullet";
    readonly id: EntityId;
    readonly ownerId: PlayerId;
    readonly x: number;
    readonly y: number;
}

export type SnapshotEntity =
    | PlayerSnapshot
    | AsteroidSnapshot
    | PickupSnapshot
    | BulletSnapshot;

export interface GameSnapshot {
    readonly type: "snapshot";
    readonly roomId?: string;
    readonly tick: Tick;
    readonly serverTime: number;
    readonly players: readonly PlayerSnapshot[];
    readonly asteroids: readonly AsteroidSnapshot[];
    readonly pickups: readonly PickupSnapshot[];
    readonly bullets: readonly BulletSnapshot[];
}