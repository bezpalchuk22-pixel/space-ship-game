import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";

const PORT = 3107;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

const CLIENT_COUNTS = [8, 16, 32, 64];
const WARMUP_MS = 2000;
const MEASURE_MS = 10000;
const INPUT_INTERVAL_MS = 1000 / 30;

interface ClientMetrics {
    socket: WebSocket;
    roomId: string;
    seq: number;
    receivedBytes: number;
    sentBytes: number;
    snapshots: number;
    rtts: number[];
    pendingPings: Map<number, number>;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.ceil(sorted.length * p) - 1
    );

    return sorted[index] ?? 0;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;

    return values.reduce((sum, value) => sum + value, 0)
        / values.length;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const response = await fetch(`${BASE_URL}/health`);

            if (response.ok) {
                console.log("Сервер запущено.");
                return;
            }
        } catch {
            // Сервер ще запускається.
        }

        await delay(250);
    }

    throw new Error("Сервер не запустився на порту 3107.");
}

async function createRooms(count: number): Promise<string[]> {
    const roomIds: string[] = [];

    for (let i = 0; i < count; i++) {
        const response = await fetch(`${BASE_URL}/api/rooms`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: `Load test ${Date.now()} ${i}`
            })
        });

        if (!response.ok) {
            throw new Error(
                `Не вдалося створити кімнату ${i + 1}: ${response.status}`
            );
        }

        const result = await response.json() as {
            room: { id: string };
        };

        roomIds.push(result.room.id);
    }

    return roomIds;
}

function connectClient(
    roomId: string,
    index: number
): Promise<ClientMetrics> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(WS_URL, {
            origin: `http://127.0.0.1:${PORT}`
        });
        const metrics: ClientMetrics = {
            socket,
            roomId,
            seq: 0,
            receivedBytes: 0,
            sentBytes: 0,
            snapshots: 0,
            rtts: [],
            pendingPings: new Map()
        };

        let joined = false;

        const timeout = setTimeout(() => {
            if (!joined) {
                socket.terminate();
                reject(new Error(`Клієнт ${index}: тайм-аут приєднання.`));
            }
        }, 10000);

        socket.on("open", () => {
            const message = JSON.stringify({
                type: "join",
                roomId,
                name: `Bot-${index}`,
                protocolMode: "json"
            });

            metrics.sentBytes += Buffer.byteLength(message);
            socket.send(message);
        });

        socket.on("message", data => {
            const buffer = Buffer.isBuffer(data)
                ? data
                : Array.isArray(data)
                    ? Buffer.concat(data)
                    : Buffer.from(data as ArrayBuffer);

            metrics.receivedBytes += buffer.length;

            let message: Record<string, unknown>;

            try {
                message = JSON.parse(buffer.toString("utf8")) as Record<string, unknown>;
            } catch {
                return;
            }

            if (message.type === "joined" && !joined) {
                joined = true;
                clearTimeout(timeout);
                resolve(metrics);
            }

            if (message.type === "snapshot") {
                metrics.snapshots++;
            }

            if (message.type === "net-pong") {
                const id = Number(message.id);
                const sentAt = metrics.pendingPings.get(id);

                if (sentAt !== undefined) {
                    metrics.rtts.push(performance.now() - sentAt);
                    metrics.pendingPings.delete(id);
                }
            }
        });

        socket.on("error", error => {
            if (!joined) {
                clearTimeout(timeout);
                reject(error);
            }
        });

        socket.on("close", () => {
            if (!joined) {
                clearTimeout(timeout);
                reject(
                    new Error(`Клієнт ${index}: з'єднання закрито до join.`)
                );
            }
        });
    });
}

async function closeClients(clients: ClientMetrics[]): Promise<void> {
    for (const client of clients) {
        if (client.socket.readyState === WebSocket.OPEN) {
            client.socket.close(1000, "Load test complete");
        }
    }

    await delay(500);

    for (const client of clients) {
        if (client.socket.readyState !== WebSocket.CLOSED) {
            client.socket.terminate();
        }
    }

    await delay(250);
}

async function runScenario(clientCount: number): Promise<void> {
    console.log(`\n========== ${clientCount} КЛІЄНТІВ ==========`);

    const roomCount = Math.ceil(clientCount / 4);
    const roomIds = await createRooms(roomCount);

    const clients: ClientMetrics[] = [];
    let trafficTimer: ReturnType<typeof setInterval> | null = null;

    try {
        const connections = Array.from(
            { length: clientCount },
            (_, index) => {
                const roomId = roomIds[Math.floor(index / 4)]!;
                return connectClient(roomId, index + 1);
            }
        );

        clients.push(...await Promise.all(connections));

        console.log(`Підключено клієнтів: ${clients.length}`);
        console.log(`Кімнат: ${roomCount}`);

        let pingId = 0;

        trafficTimer = setInterval(() => {
            for (const client of clients) {
                if (client.socket.readyState !== WebSocket.OPEN) {
                    continue;
                }

                const input = JSON.stringify({
                    type: "input",
                    seq: ++client.seq,
                    throttle: 0.7,
                    turn: Math.sin(client.seq / 20) * 0.5,
                    shoot: client.seq % 9 === 0
                });

                client.sentBytes += Buffer.byteLength(input);
                client.socket.send(input);

                if (client.seq % 30 === 0) {
                    const id = ++pingId;
                    const sentAt = performance.now();

                    client.pendingPings.set(id, sentAt);

                    const ping = JSON.stringify({
                        type: "net-ping",
                        id,
                        clientTime: sentAt
                    });

                    client.sentBytes += Buffer.byteLength(ping);
                    client.socket.send(ping);
                }
            }
        }, INPUT_INTERVAL_MS);

        await delay(WARMUP_MS);

        for (const client of clients) {
            client.receivedBytes = 0;
            client.sentBytes = 0;
            client.snapshots = 0;
            client.rtts = [];
            client.pendingPings.clear();
        }

        console.log("Вимірювання розпочато...");

        const startedAt = performance.now();
        await delay(MEASURE_MS);
        const elapsedSeconds = (performance.now() - startedAt) / 1000;

        clearInterval(trafficTimer);
        trafficTimer = null;

        const allRtts = clients.flatMap(client => client.rtts);

        const totalSnapshots = clients.reduce(
            (sum, client) => sum + client.snapshots,
            0
        );

        const totalReceived = clients.reduce(
            (sum, client) => sum + client.receivedBytes,
            0
        );

        const totalSent = clients.reduce(
            (sum, client) => sum + client.sentBytes,
            0
        );

        console.log(`Тривалість: ${elapsedSeconds.toFixed(2)} с`);
        console.log(`Отримано snapshot: ${totalSnapshots}`);

        console.log(
            `Snapshot на клієнта: ${(totalSnapshots / clientCount / elapsedSeconds).toFixed(2)} / с`
        );

        console.log(`RTT вимірювань: ${allRtts.length}`);
        console.log(`RTT average: ${average(allRtts).toFixed(2)} ms`);
        console.log(`RTT p50: ${percentile(allRtts, 0.50).toFixed(2)} ms`);
        console.log(`RTT p95: ${percentile(allRtts, 0.95).toFixed(2)} ms`);
        console.log(`RTT p99: ${percentile(allRtts, 0.99).toFixed(2)} ms`);

        console.log(
            `Вхідний трафік: ${(totalReceived / elapsedSeconds / 1024).toFixed(2)} KB/s`
        );

        console.log(
            `Вихідний трафік: ${(totalSent / elapsedSeconds / 1024).toFixed(2)} KB/s`
        );
    } finally {
        if (trafficTimer !== null) {
            clearInterval(trafficTimer);
        }

        await closeClients(clients);
    }
}

async function main(): Promise<void> {
    const server = spawn(
        process.execPath,
        ["--import", "tsx", "server/src/index.ts"],
        {
            env: {
                ...process.env,
                PORT: String(PORT),
                ALLOWED_ORIGINS: `http://127.0.0.1:${PORT}`,
                MAX_CONNECTIONS_PER_IP: "100",
                MAX_ROOMS: "100"
            },
            stdio: "inherit"
        }
    );

    try {
        await waitForServer();

        for (const count of CLIENT_COUNTS) {
            await runScenario(count);
        }

        console.log("\nНавантажувальний тест завершено.");
    } finally {
        if (server.exitCode === null) {
            server.kill("SIGTERM");

            await Promise.race([
                new Promise<void>(resolve => {
                    server.once("exit", () => resolve());
                }),
                delay(5000)
            ]);

            if (server.exitCode === null) {
                server.kill("SIGKILL");
            }
        }
    }
}

main().catch(error => {
    console.error("Помилка навантажувального тесту:", error);
    process.exitCode = 1;
});
