import "./style.css";

import { World } from "./entities/World.ts";
import { Lobby } from "./lobby/Lobby.ts";
import { LobbyUI } from "./lobby/LobbyUI.ts";
import { NetworkGame } from "./network/NetworkGame.ts";
import { createInput } from "./input.ts";
import { createLoop } from "./gameLoop.ts";

import type {
    GameSnapshot,
    ShipInput
} from "../../shared/Types.ts";

interface JoinDetail {
    readonly playerName: string;
    readonly room: {
        readonly id: string | number;
        readonly name: string;
    };
}

interface NetworkStats {
    readonly rtt: number;
    readonly snapshotAge: number;
    readonly bytesSent: number;
    readonly bytesReceived: number;
    readonly bytesPerSecondSent: number;
    readonly bytesPerSecondReceived: number;
    readonly inputQueue: number;
    readonly correctionSize: number;
    readonly ackSeq: number;
    readonly seq: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isJoinDetail(value: unknown): value is JoinDetail {
    if (!isRecord(value) || !isRecord(value.room)) {
        return false;
    }

    return (
        typeof value.playerName === "string" &&
        (typeof value.room.id === "string" ||
            typeof value.room.id === "number") &&
        typeof value.room.name === "string"
    );
}

function isSnapshot(value: unknown): value is GameSnapshot {
    return (
        isRecord(value) &&
        value.type === "snapshot" &&
        typeof value.tick === "number" &&
        typeof value.serverTime === "number" &&
        Array.isArray(value.players) &&
        Array.isArray(value.asteroids) &&
        Array.isArray(value.pickups) &&
        Array.isArray(value.bullets)
    );
}

function isNetworkStats(value: unknown): value is NetworkStats {
    if (!isRecord(value)) {
        return false;
    }

    return (
        typeof value.rtt === "number" &&
        typeof value.snapshotAge === "number" &&
        typeof value.bytesSent === "number" &&
        typeof value.bytesReceived === "number" &&
        typeof value.bytesPerSecondSent === "number" &&
        typeof value.bytesPerSecondReceived === "number" &&
        typeof value.inputQueue === "number" &&
        typeof value.correctionSize === "number" &&
        typeof value.ackSeq === "number" &&
        typeof value.seq === "number"
    );
}

function getElement<T extends HTMLElement>(
    root: ParentNode | null,
    selector: string
): T {
    if (!root) {
        throw new Error("Root element not found");
    }

    const element = root.querySelector<T>(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    return element;
}

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
    throw new Error("Не знайдено елемент #app");
}

/* HTML гри */

app.innerHTML = `
    <section class="game-screen" hidden>
        <header class="hud">
            <div>
                Кімната:
                <strong id="room-label">—</strong>
            </div>

            <div>
                Гравець:
                <strong id="player-label">—</strong>
            </div>

            <div>
                Стан:
                <strong id="connection-label">Очікування</strong>
            </div>

            <div>
                Такт:
                <strong id="tick-label">0</strong>
            </div>
        </header>

        <canvas id="game"></canvas>

        <div class="game-help">
            WASD / стрілки — рух · Space — стрільба · Esc — вихід
        </div>

        <section class="network-emulator">
            <h3>Емулятор мережі</h3>

            <label>
                Latency:
                <strong id="latency-value">0 мс</strong>

                <input
                    id="latency-input"
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value="0"
                >
            </label>

            <label>
                Jitter:
                <strong id="jitter-value">0 мс</strong>

                <input
                    id="jitter-input"
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value="0"
                >
            </label>

            <label>
                Packet loss:
                <strong id="loss-value">0%</strong>

                <input
                    id="loss-input"
                    type="range"
                    min="0"
                    max="30"
                    step="1"
                    value="0"
                >
            </label>

            <button id="network-reset" type="button">
                Скинути налаштування
            </button>
        </section>

        <section class="network-stats">
            <h3>Network statistics</h3>

            <div>RTT: <strong id="rtt-value">0 ms</strong></div>
            <div>Snapshot age: <strong id="snapshot-age">0 ms</strong></div>
            <div>Bytes sent: <strong id="bytes-sent">0</strong></div>
            <div>Bytes received: <strong id="bytes-received">0</strong></div>
            <div>Send rate: <strong id="send-rate">0 B/s</strong></div>
            <div>Receive rate: <strong id="receive-rate">0 B/s</strong></div>
            <div>Input queue: <strong id="input-queue">0</strong></div>
            <div>Correction: <strong id="correction-size">0</strong></div>
            <div>Sequence: <strong id="sequence-value">0</strong></div>
            <div>ACK: <strong id="ack-value">0</strong></div>
        </section>

        <section class="chat">
            <div id="chat-messages" class="chat__messages"></div>

            <form id="chat-form">
                <input
                    id="chat-input"
                    maxlength="300"
                    placeholder="Повідомлення..."
                    autocomplete="off"
                >

                <button type="submit">
                    Надіслати
                </button>
            </form>
        </section>

        <button id="leave-game" type="button">
            Вийти з гри
        </button>
    </section>
`;

/* DOM */

const gameScreen = getElement<HTMLElement>(
    app,
    ".game-screen"
);

const canvas = getElement<HTMLCanvasElement>(
    app,
    "#game"
);

const context = canvas.getContext("2d");

if (!context) {
    throw new Error("Canvas 2D Context недоступний");
}

const roomLabel = getElement<HTMLElement>(
    app,
    "#room-label"
);

const playerLabel = getElement<HTMLElement>(
    app,
    "#player-label"
);

const connectionLabel = getElement<HTMLElement>(
    app,
    "#connection-label"
);

const tickLabel = getElement<HTMLElement>(
    app,
    "#tick-label"
);

const chatForm = getElement<HTMLFormElement>(
    app,
    "#chat-form"
);

const chatInput = getElement<HTMLInputElement>(
    app,
    "#chat-input"
);

const chatMessages = getElement<HTMLElement>(
    app,
    "#chat-messages"
);

const leaveButton = getElement<HTMLButtonElement>(
    app,
    "#leave-game"
);

/* Lobby */

const lobby = new Lobby();

const lobbyUI = new LobbyUI(
    lobby,
    app
);

/* Game state */

let world: World | null = null;
let network: NetworkGame | null = null;
let input: ReturnType<typeof createInput> | null = null;
let loop: ReturnType<typeof createLoop> | null = null;

let gameRunning = false;
let inputAccumulator = 0;

const INPUT_INTERVAL = 1 / 30;

/* Canvas */

function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    context?.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );
}

window.addEventListener("resize", resizeCanvas);

/* Chat */

function addChatMessage(text: string): void {
    const message = document.createElement("div");

    message.className = "chat__message";
    message.textContent = text;

    chatMessages.appendChild(message);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleChatMessage(value: unknown): void {
    if (!isRecord(value)) {
        return;
    }

    const name =
        typeof value.name === "string"
            ? value.name
            : "Гравець";

    const text =
        typeof value.text === "string"
            ? value.text
            : "";

    addChatMessage(`${name}: ${text}`);
}

function handleSystemMessage(value: unknown): void {
    if (!isRecord(value)) {
        return;
    }

    if (typeof value.text === "string") {
        addChatMessage(`[Система] ${value.text}`);
    }
}

/* Network statistics */

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${Math.round(bytes)} B/s`;
    }

    return `${(bytes / 1024).toFixed(2)} KB/s`;
}

function updateNetworkStats(stats: NetworkStats): void {
    getElement(app, "#rtt-value").textContent =
        `${stats.rtt.toFixed(1)} ms`;

    getElement(app, "#snapshot-age").textContent =
        `${stats.snapshotAge.toFixed(1)} ms`;

    getElement(app, "#bytes-sent").textContent =
        String(stats.bytesSent);

    getElement(app, "#bytes-received").textContent =
        String(stats.bytesReceived);

    getElement(app, "#send-rate").textContent =
        formatBytes(stats.bytesPerSecondSent);

    getElement(app, "#receive-rate").textContent =
        formatBytes(stats.bytesPerSecondReceived);

    getElement(app, "#input-queue").textContent =
        String(stats.inputQueue);

    getElement(app, "#correction-size").textContent =
        stats.correctionSize.toFixed(2);

    getElement(app, "#sequence-value").textContent =
        String(stats.seq);

    getElement(app, "#ack-value").textContent =
        String(stats.ackSeq);
}

/* Input */

function getShipInput(): ShipInput {
    if (!input) {
        return {
            throttle: 0,
            turn: 0,
            shoot: false
        };
    }

    const state = input.getState();

    let throttle = 0;
    let turn = 0;

    if (state.forward) {
        throttle = 1;
    } else if (state.backward) {
        throttle = -1;
    }

    if (state.left) {
        turn = -1;
    } else if (state.right) {
        turn = 1;
    }

    return {
        throttle,
        turn,
        shoot: input.isPressed("Space")
    };
}

/* Game loop */

function update(dt: number): void {
    if (!world || !network || !input) {
        return;
    }

    if (!network.joined) {
        return;
    }

    const shipInput = getShipInput();

    inputAccumulator += dt;

    while (inputAccumulator >= INPUT_INTERVAL) {
        inputAccumulator -= INPUT_INTERVAL;

        world.predictNetworkInput(shipInput);

        network.sendInput(shipInput);
    }

    world.step(dt);
}

function render(): void {
    if (!world || !context) {
        return;
    }

    context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    world.render(context);
}

/* Stop game */

function stopGame(): void {
    gameRunning = false;

    loop?.stop();
    loop = null;

    input?.destroy();
    input = null;

    network?.close();
    network = null;

    world = null;

    inputAccumulator = 0;

    gameScreen.hidden = true;

    lobbyUI.show();
}

/* Start game */

function startGame(
    roomId: string,
    roomName: string,
    playerName: string,
    protocolMode: "json" | "binary"
): void {
    if (gameRunning) {
        stopGame();
    }

    lobbyUI.hide();

    gameScreen.hidden = false;

    roomLabel.textContent = roomName;
    playerLabel.textContent = playerName;
    connectionLabel.textContent = "Підключення...";
    tickLabel.textContent = "0";

    chatMessages.replaceChildren();

    resizeCanvas();

    world = new World(
        canvas.clientWidth,
        canvas.clientHeight
    );

    input = createInput();

    network = new NetworkGame();
    network.setProtocolMode(protocolMode);

    network.addEventListener("open", () => {
        connectionLabel.textContent = "Підключено";

        network?.join(
            roomId,
            playerName
        );
    });

    network.addEventListener("joined", () => {
        connectionLabel.textContent = "У грі";

        gameRunning = true;

        loop = createLoop({
            update,
            render,
            fixedDt: 1 / 60
        });

        loop.start();

        addChatMessage(
            `Ви приєдналися до кімнати ${roomName}`
        );
    });

    network.addEventListener("snapshot", event => {
        if (!world || !network) {
            return;
        }

        const snapshot = event instanceof CustomEvent
            ? event.detail
            : null;

        if (!isSnapshot(snapshot)) {
            return;
        }

        if (network.playerId) {
            world.applyNetworkSnapshot(
                snapshot,
                network.playerId,
                network.pendingInputs
            );
        }

        tickLabel.textContent =
            String(snapshot.tick);
    });

    network.addEventListener("networkStats", event => {
        if (!(event instanceof CustomEvent)) {
            return;
        }

        if (isNetworkStats(event.detail)) {
            updateNetworkStats(event.detail);
        }
    });

    network.addEventListener("chat", event => {
        if (event instanceof CustomEvent) {
            handleChatMessage(event.detail);
        }
    });

    network.addEventListener("system", event => {
        if (event instanceof CustomEvent) {
            handleSystemMessage(event.detail);
        }
    });

    network.addEventListener("error", event => {
        if (event instanceof CustomEvent) {
            const detail = event.detail;

            if (
                isRecord(detail) &&
                typeof detail.message === "string"
            ) {
                addChatMessage(
                    `[Помилка] ${detail.message}`
                );
            }
        }
    });

    network.addEventListener("networkError", event => {
        if (event instanceof CustomEvent) {
            const detail = event.detail;

            if (
                isRecord(detail) &&
                typeof detail.message === "string"
            ) {
                connectionLabel.textContent = "Помилка";

                addChatMessage(
                    `[Мережа] ${detail.message}`
                );
            }
        }
    });

    network.addEventListener("close", () => {
        connectionLabel.textContent = "Відключено";
    });

    network.connect();
}

/* Lobby join */

lobby.addEventListener("join", event => {
    if (!(event instanceof CustomEvent)) {
        return;
    }

    const detail: unknown = event.detail;

    if (!isJoinDetail(detail)) {
        return;
    }

    const protocolSelect =
        document.querySelector<HTMLSelectElement>("#lobby-protocol");

    const protocolMode =
        protocolSelect?.value === "json" ? "json" : "binary";

    startGame(
        String(detail.room.id),
        detail.room.name,
        detail.playerName,
        protocolMode
    );
});

/* Chat form */

chatForm.addEventListener("submit", event => {
    event.preventDefault();

    const text = chatInput.value.trim();

    if (!text || !network || !network.joined) {
        return;
    }

    network.sendChat(text);

    chatInput.value = "";
    chatInput.focus();
});

/* Exit */

leaveButton.addEventListener("click", () => {
    stopGame();
});

window.addEventListener("keydown", event => {
    if (event.code === "Escape" && gameRunning) {
        stopGame();
    }
});

/* Cleanup */

window.addEventListener("beforeunload", () => {
    loop?.stop();
    input?.destroy();
    network?.close();
    lobbyUI.destroy();
});

/* Start lobby */

lobbyUI.show();

console.log("MAIN TS ЗАПУЩЕНО");
console.log("Lobby:", lobby);
console.log("Lobby UI:", lobbyUI);