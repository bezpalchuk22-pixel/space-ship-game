
const MAGIC = 0x5353;
const VERSION = 1;

const PACKET_SNAPSHOT = 1;
const PACKET_INPUT = 2;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getView(data) {
    if (data instanceof ArrayBuffer) {
        return new DataView(data);
    }

    if (ArrayBuffer.isView(data)) {
        return new DataView(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
    }

    throw new TypeError("Unsupported binary packet");
}

function stringSize(value) {
    const bytes = encoder.encode(String(value));
    if (bytes.length > 255) {
        throw new RangeError("String is too long");
    }
    return 1 + bytes.length;
}

function writeString(view, offset, value) {
    const bytes = encoder.encode(String(value));

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

function readString(view, offset) {
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

function angleToInt16(angle) {
    const normalized = Math.max(
        -Math.PI,
        Math.min(Math.PI, angle)
    );

    return Math.round(normalized / Math.PI * 32767);
}

function int16ToAngle(value) {
    return value / 32767 * Math.PI;
}

export function encodeSnapshot(snapshot) {
    const players = snapshot.players ?? [];
    const asteroids = snapshot.asteroids ?? [];
    const pickups = snapshot.pickups ?? [];
    const bullets = snapshot.bullets ?? [];

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

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);

    let offset = 0;

    view.setUint16(offset, MAGIC, true);
    offset += 2;

    view.setUint8(offset++, VERSION);
    view.setUint8(offset++, PACKET_SNAPSHOT);

    view.setUint32(offset, snapshot.tick >>> 0, true);
    offset += 4;

    view.setFloat64(offset, snapshot.serverTime ?? 0, true);
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

        view.setUint32(offset, player.seq >>> 0, true);
        offset += 4;

        view.setFloat32(offset, player.x, true);
        offset += 4;

        view.setFloat32(offset, player.y, true);
        offset += 4;

        view.setInt16(
            offset,
            angleToInt16(player.angle),
            true
        );
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

export function encodeInput(input) {
    const buffer = new ArrayBuffer(11);
    const view = new DataView(buffer);

    view.setUint16(0, MAGIC, true);
    view.setUint8(2, VERSION);
    view.setUint8(3, PACKET_INPUT);

    view.setUint32(4, input.seq >>> 0, true);

    const throttle = Math.max(
        -1,
        Math.min(1, Number(input.throttle) || 0)
    );

    const turn = Math.max(
        -1,
        Math.min(1, Number(input.turn) || 0)
    );

    view.setInt8(8, Math.round(throttle * 127));
    view.setInt8(9, Math.round(turn * 127));
    view.setUint8(10, input.shoot ? 1 : 0);

    return buffer;
}

export function decodeInput(data) {
    const view = getView(data);

    if (view.byteLength !== 11) {
        throw new RangeError("Invalid input packet size");
    }

    if (
        view.getUint16(0, true) !== MAGIC ||
        view.getUint8(2) !== VERSION ||
        view.getUint8(3) !== PACKET_INPUT
    ) {
        throw new Error("Invalid input packet header");
    }

    return {
        seq: view.getUint32(4, true),
        throttle: view.getInt8(8) / 127,
        turn: view.getInt8(9) / 127,
        shoot: view.getUint8(10) !== 0
    };
}

export function decodeSnapshot(data) {
    const view = getView(data);

    if (view.byteLength < 24) {
        throw new RangeError("Snapshot packet is too short");
    }

    if (
        view.getUint16(0, true) !== MAGIC ||
        view.getUint8(2) !== VERSION ||
        view.getUint8(3) !== PACKET_SNAPSHOT
    ) {
        throw new Error("Invalid snapshot packet header");
    }

    let offset = 4;

    const tick = view.getUint32(offset, true);
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

    const players = [];
    const asteroids = [];
    const pickups = [];
    const bullets = [];

    for (let i = 0; i < playerCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        const seq = view.getUint32(offset, true);
        offset += 4;

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const angle = int16ToAngle(
            view.getInt16(offset, true)
        );
        offset += 2;

        const hp = view.getUint8(offset++);

        players.push({
            id: id.value,
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

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const radius = view.getFloat32(offset, true);
        offset += 4;

        asteroids.push({
            id: id.value,
            x,
            y,
            radius
        });
    }

    for (let i = 0; i < pickupCount; i++) {
        const id = readString(view, offset);
        offset = id.offset;

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        const radius = view.getFloat32(offset, true);
        offset += 4;

        pickups.push({
            id: id.value,
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

        const x = view.getFloat32(offset, true);
        offset += 4;

        const y = view.getFloat32(offset, true);
        offset += 4;

        bullets.push({
            id: id.value,
            ownerId: ownerId.value,
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

export function decodePacket(data) {
    const view = getView(data);

    if (view.byteLength < 24) {
        throw new RangeError("Packet is too short");
    }

    if (
        view.getUint16(0, true) !== MAGIC ||
        view.getUint8(2) !== VERSION
    ) {
        throw new Error("Invalid packet header");
    }

    const type = view.getUint8(3);

    if (type === PACKET_SNAPSHOT) {
        return decodeSnapshot(data);
    }

    throw new Error("Unknown binary packet type");
}
