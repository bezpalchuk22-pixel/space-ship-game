
import type {
    GameSnapshot,
    Tick,
    SequenceNumber,
    PlayerSnapshot,
    AsteroidSnapshot,
    PickupSnapshot,
    BulletSnapshot
} from "./Types.js";

import {
    toEntityId,
    toPlayerId,
    toTick,
    toSequenceNumber
} from "./Types.js";

const MAGIC = 0x5353;
const VERSION = 1;

const PACKET_SNAPSHOT = 1;
const PACKET_INPUT = 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface InputPacket {
    readonly seq: SequenceNumber;
    readonly throttle: number;
    readonly turn: number;
    readonly shoot: boolean;
}

export type BinaryPacket = GameSnapshot | InputPacket;

function getView(data: ArrayBuffer | ArrayBufferView): DataView {
    if (data instanceof ArrayBuffer) {
        return new DataView(data);
    }

    return new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength
    );
}

function stringSize(value: string): number {
    const bytes = encoder.encode(value);

    if (bytes.length > 255) {
        throw new RangeError("String is too long");
    }

    return 1 + bytes.length;
}

function writeString(
    view: DataView,
    offset: number,
    value: string
): number {
    const bytes = encoder.encode(value);

    if (bytes.length > 255) {
        throw new RangeError("String is too long");
    }

    view.setUint8(offset, bytes.length);
    offset += 1;

    new Uint8Array(
        view.buffer,
        view.byteOffset + offset,
        bytes.length
    ).set(bytes);

    return offset + bytes.length;
}

function readString(
    view: DataView,
    offset: number
): { readonly value: string; readonly offset: number } {
    if (offset >= view.byteLength) {
        throw new RangeError("Missing string length");
    }

    const length = view.getUint8(offset);
    offset += 1;

    if (offset + length > view.byteLength) {
        throw new RangeError("Invalid string length");
    }

    const bytes = new Uint8Array(
        view.buffer,
        view.byteOffset + offset,
        length
    );

    return {
        value: decoder.decode(bytes),
        offset: offset + length
    };
}

function angleToInt16(angle: number): number {
    const normalized = Math.max(
        -Math.PI,
        Math.min(Math.PI, angle)
    );

    return Math.round(normalized / Math.PI * 32767);
}

function int16ToAngle(value: number): number {
    return value / 32767 * Math.PI;
}

function assertRemaining(
    view: DataView,
    offset: number,
    length: number
): void {
    if (offset < 0 || length < 0 || offset + length > view.byteLength) {
        throw new RangeError("Unexpected end of binary packet");
    }
}

function validateHeader(
    view: DataView,
    expectedType: number
): void {
    if (view.byteLength < 4) {
        throw new RangeError("Packet header is too short");
    }

    if (view.getUint16(0, true) !== MAGIC) {
        throw new Error("Invalid packet magic");
    }

    if (view.getUint8(2) !== VERSION) {
        throw new Error("Unsupported packet version");
    }

    if (view.getUint8(3) !== expectedType) {
        throw new Error("Invalid packet type");
    }
}

export function encodeSnapshot(snapshot: GameSnapshot): ArrayBuffer {
    const { players, asteroids, pickups, bullets } = snapshot;

    let size = 24;

    for (const player of players) {
        size += stringSize(player.id) + 15;
    }

    for (const item of asteroids) {
        size += stringSize(item.id) + 12;
    }

    for (const item of pickups) {
        size += stringSize(item.id) + 12;
    }

    for (const bullet of bullets) {
        size += stringSize(bullet.id);
        size += stringSize(bullet.ownerId);
        size += 8;
    }

    if (
        players.length > 0xFFFF ||
        asteroids.length > 0xFFFF ||
        pickups.length > 0xFFFF ||
        bullets.length > 0xFFFF
    ) {
        throw new RangeError("Too many snapshot entities");
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);

    let offset = 0;

    view.setUint16(offset, MAGIC, true);
    offset += 2;

    view.setUint8(offset++, VERSION);
    view.setUint8(offset++, PACKET_SNAPSHOT);

    view.setUint32(offset, snapshot.tick, true);
    offset += 4;

    view.setFloat64(offset, snapshot.serverTime, true);
    offset += 8;

    view.setUint16(offset, players.length, true);
    offset += 2;

    view.setUint16(offset, asteroids.length, true);
    offset += 2;

    view.setUint16(offset, pickups.length, true);
    offset += 2;

    view.setUint16(offset, bullets.length, true);
    offset += 2;

    for (const player of players) {
        offset = writeString(view, offset, player.id);

        view.setUint32(offset, player.seq, true);
        offset += 4;

        view.setFloat32(offset, player.x, true);
        offset += 4;

        view.setFloat32(offset, player.y, true);
        offset += 4;

        view.setInt16(offset, angleToInt16(player.angle), true);
        offset += 2;

        view.setUint8(
            offset,
            Math.max(0, Math.min(100, player.hp))
        );
        offset += 1;
    }

    for (const item of asteroids) {
        offset = writeString(view, offset, item.id);

        view.setFloat32(offset, item.x, true);
        offset += 4;

        view.setFloat32(offset, item.y, true);
        offset += 4;

        view.setFloat32(offset, item.radius, true);
        offset += 4;
    }

    for (const item of pickups) {
        offset = writeString(view, offset, item.id);

        view.setFloat32(offset, item.x, true);
        offset += 4;

        view.setFloat32(offset, item.y, true);
        offset += 4;

        view.setFloat32(offset, item.radius, true);
        offset += 4;
    }

    for (const bullet of bullets) {
        offset = writeString(view, offset, bullet.id);
        offset = writeString(view, offset, bullet.ownerId);

        view.setFloat32(offset, bullet.x, true);
        offset += 4;

        view.setFloat32(offset, bullet.y, true);
        offset += 4;
    }

    return buffer;
}

export function encodeInput(input: InputPacket): ArrayBuffer {
    const buffer = new ArrayBuffer(11);
    const view = new DataView(buffer);

    view.setUint16(0, MAGIC, true);
    view.setUint8(2, VERSION);
    view.setUint8(3, PACKET_INPUT);

    view.setUint32(4, input.seq, true);

    const throttle = Math.max(
        -1,
        Math.min(1, input.throttle)
    );

    const turn = Math.max(
        -1,
        Math.min(1, input.turn)
    );

    view.setInt8(8, Math.round(throttle * 127));
    view.setInt8(9, Math.round(turn * 127));
    view.setUint8(10, input.shoot ? 1 : 0);

    return buffer;
}

export function decodeInput(
    data: ArrayBuffer | ArrayBufferView
): InputPacket {
    const view = getView(data);

    if (view.byteLength !== 11) {
        throw new RangeError("Invalid input packet size");
    }

    validateHeader(view, PACKET_INPUT);

    const seq = toSequenceNumber(view.getUint32(4, true));

    return {
        seq,
        throttle: view.getInt8(8) / 127,
        turn: view.getInt8(9) / 127,
        shoot: view.getUint8(10) !== 0
    };
}

export function decodeSnapshot(
    data: ArrayBuffer | ArrayBufferView
): GameSnapshot {
    const view = getView(data);

    if (view.byteLength < 24) {
        throw new RangeError("Snapshot packet is too short");
    }

    validateHeader(view, PACKET_SNAPSHOT);

    let offset = 4;

    const tick: Tick = toTick(view.getUint32(offset, true));
    offset += 4;

    const serverTime = view.getFloat64(offset, true);
    offset += 8;

    const playerCount = view.getUint16(offset, true);
    offset += 2;

    const asteroidCount = view.getUint16(offset, true);
    offset += 2;

    const pickupCount = view.getUint16(offset, true);
    offset += 2;

    const bulletCount = view.getUint16(offset, true);
    offset += 2;

    if (
        playerCount > 100 ||
        asteroidCount > 1000 ||
        pickupCount > 1000 ||
        bulletCount > 2000
    ) {
        throw new RangeError("Snapshot entity limit exceeded");
    }

    const players: PlayerSnapshot[] = [];
    const asteroids: AsteroidSnapshot[] = [];
    const pickups: PickupSnapshot[] = [];
    const bullets: BulletSnapshot[] = [];

    for (let i = 0; i < playerCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        assertRemaining(view, offset, 15);

        const seq: SequenceNumber = toSequenceNumber(
            view.getUint32(offset, true)
        );
        offset += 4;

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const angle = int16ToAngle(view.getInt16(offset, true));
        offset += 2;

        const hp = view.getUint8(offset++);

        players.push({
            kind: "player",
            id: toPlayerId(id.value),
            seq,
            x,
            y,
            angle,
            hp
        });
    }

    for (let i = 0; i < asteroidCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        assertRemaining(view, offset, 12);

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const radius = view.getFloat32(offset, true);
        offset += 4;

        asteroids.push({
            kind: "asteroid",
            id: toEntityId(id.value),
            x,
            y,
            radius
        });
    }

    for (let i = 0; i < pickupCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        assertRemaining(view, offset, 12);

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const radius = view.getFloat32(offset, true);
        offset += 4;

        pickups.push({
            kind: "pickup",
            id: toEntityId(id.value),
            x,
            y,
            radius
        });
    }

    for (let i = 0; i < bulletCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        const ownerId = readString(view, offset);
        offset = ownerId.offset;

        assertRemaining(view, offset, 8);

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        bullets.push({
            kind: "bullet",
            id: toEntityId(id.value),
            ownerId: toPlayerId(ownerId.value),
            x,
            y
        });
    }

    if (offset !== view.byteLength) {
        throw new Error("Unexpected data at end of snapshot");
    }

    return {
        type: "snapshot",
        tick,
        serverTime,
        players,
        asteroids,
        pickups,
        bullets
    };
}

export function decodePacket(
    data: ArrayBuffer | ArrayBufferView
): BinaryPacket {
    const view = getView(data);

    if (view.byteLength < 4) {
        throw new RangeError("Packet is too short");
    }

    if (view.getUint16(0, true) !== MAGIC) {
        throw new Error("Invalid packet magic");
    }

    if (view.getUint8(2) !== VERSION) {
        throw new Error("Unsupported packet version");
    }

    const type = view.getUint8(3);

    switch (type) {
        case PACKET_SNAPSHOT:
            return decodeSnapshot(data);

        case PACKET_INPUT:
            return decodeInput(data);

        default:
            throw new Error(`Unknown binary packet type: ${type}`);
    }
}