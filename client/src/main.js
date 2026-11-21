
import "./style.css";

import { World } from "./entities/World.js";
import { Lobby } from "./lobby/Lobby.js";
import { LobbyUI } from "./lobby/LobbyUI.js";
import { NetworkGame } from "./network/NetworkGame.js";
import { createInput } from "./input.js";
import { createLoop } from "./gameLoop.js";

const app = document.querySelector("#app");

if (!app) {
    throw new Error("Не знайдено елемент #app");
}

app.innerHTML = `
    <section class="game-screen" hidden>
        <header class="hud">
            <div>Кімната: <strong id="room-label">—</strong></div>
            <div>Гравець: <strong id="player-label">—</strong></div>
            <div>Стан: <strong id="connection-label">Підключення...</strong></div>
            <div>Такт: <strong id="tick-label">0</strong></div>
        </header>

        <canvas id="game"></canvas>

        <div class="game-help">
            WASD / стрілки — рух · Space — стрільба · Esc — вихід
        </div>

        <section class="network-emulator">
            <h3>Емулятор мережі</h3>

            <label>
                Latency: <strong id="latency-value">0 мс</strong>
                <input id="latency-input" type="range"
                    min="0" max="500" step="10" value="0">
            </label>

            <label>
                Jitter: <strong id="jitter-value">0 мс</strong>
                <input id="jitter-input" type="range"
                    min="0" max="200" step="5" value="0">
            </label>

            <label>
                Packet loss: <strong id="loss-value">0%</strong>
                <input id="loss-input" type="range"
                    min="0" max="30" step="1" value="0">
            </label>

            <button id="network-reset" type="button">
                Скинути налаштування
            </button>
        </section>

        <section class="chat">
            <div id="chat-messages" class="chat__messages"></div>

            <form id="chat-form">
                <input id="chat-input" maxlength="300"
                    placeholder="Повідомлення..." />

                <button type="submit">Надіслати</button>
            </form>
        </section>
    </section>
`;

const gameScreen = app.querySelector(".game-screen");
const canvas = app.querySelector("#game");

const roomLabel = app.querySelector("#room-label");
const playerLabel = app.querySelector("#player-label");
const connectionLabel = app.querySelector("#connection-label");
const tickLabel = app.querySelector("#tick-label");

const chatMessages = app.querySelector("#chat-messages");
const chatForm = app.querySelector("#chat-form");
const chatInput = app.querySelector("#chat-input");

const latencyInput = app.querySelector("#latency-input");
const jitterInput = app.querySelector("#jitter-input");
const lossInput = app.querySelector("#loss-input");

const latencyValue = app.querySelector("#latency-value");
const jitterValue = app.querySelector("#jitter-value");
const lossValue = app.querySelector("#loss-value");

const networkReset = app.querySelector("#network-reset");

const lobby = new Lobby();
const lobbyUI = new LobbyUI(lobby, app);
const network = new NetworkGame();
const input = createInput();

let world = null;
let loop = null;
let playerName = "";
let lastInputSend = 0;
let lastSnapshot = null;

function updateNetworkEmulator() {
    const latency = Number(latencyInput.value);
    const jitter = Number(jitterInput.value);
    const loss = Number(lossInput.value);

    latencyValue.textContent = `${latency} мс`;
    jitterValue.textContent = `${jitter} мс`;
    lossValue.textContent = `${loss}%`;

    network.socket.setNetworkConditions({
        latency,
        jitter,
        loss
    });
}

latencyInput.addEventListener("input", updateNetworkEmulator);
jitterInput.addEventListener("input", updateNetworkEmulator);
lossInput.addEventListener("input", updateNetworkEmulator);

networkReset.addEventListener("click", () => {
    latencyInput.value = 0;
    jitterInput.value = 0;
    lossInput.value = 0;

    updateNetworkEmulator();
});

updateNetworkEmulator();

function addChatMessage(message) {
    const line = document.createElement("p");
    line.textContent = message;

    chatMessages.appendChild(line);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function startGame(room, name) {
    playerName = name;

    lastInputSend = 0;
    lastSnapshot = null;

    roomLabel.textContent = room.name;
    playerLabel.textContent = name;
    connectionLabel.textContent = "Підключення...";
    tickLabel.textContent = "0";

    lobbyUI.hide();
    gameScreen.hidden = false;

    world = new World(1200, 800);

    network.connect();

    const onJoined = event => {
        const data = event.detail;

        connectionLabel.textContent = "У грі";
        playerLabel.textContent = data.playerName || playerName;

        if (network.lastSnapshot) {
            world.applyNetworkSnapshot(
                network.lastSnapshot,
                network.playerId,
                network.pendingInputs
            );
        }

        addChatMessage("Ви приєдналися до кімнати.");
    };

    const onSnapshot = event => {
        const snapshot = event.detail;

        lastSnapshot = snapshot;
        tickLabel.textContent = String(snapshot.tick);

        if (network.playerId) {
            world.applyNetworkSnapshot(
                snapshot,
                network.playerId,
                network.pendingInputs
            );
        }
    };

    const onNetworkError = event => {
        connectionLabel.textContent = "Помилка мережі";

        addChatMessage(
            `Помилка: ${event.detail?.message || "невідома помилка"}`
        );
    };

    const onClose = () => {
        connectionLabel.textContent = "З'єднання втрачено";
    };

    const onChat = event => {
        addChatMessage(
            `${event.detail.name || "Гравець"}: ${event.detail.text || ""}`
        );
    };

    const onSystem = event => {
        addChatMessage(
            event.detail.text || "Системне повідомлення"
        );
    };

    const onError = event => {
        addChatMessage(
            `Помилка сервера: ${event.detail.message || "невідома"}`
        );
    };

    network.addEventListener("joined", onJoined);
    network.addEventListener("snapshot", onSnapshot);
    network.addEventListener("networkError", onNetworkError);
    network.addEventListener("close", onClose);
    network.addEventListener("chat", onChat);
    network.addEventListener("system", onSystem);
    network.addEventListener("error", onError);

    const context = canvas.getContext("2d");

    function resizeCanvas() {
        const width = canvas.clientWidth || window.innerWidth;
        const height = canvas.clientHeight || window.innerHeight * 0.65;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);

    function render() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        context.fillStyle = "#050816";
        context.fillRect(0, 0, width, height);

        context.strokeStyle = "rgba(255,255,255,0.05)";

        for (let x = 0; x < width; x += 50) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }

        for (let y = 0; y < height; y += 50) {
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }

        const scaleX = width / world.width;
        const scaleY = height / world.height;

        context.save();
        context.scale(scaleX, scaleY);

        for (const entity of world.entities.values()) {
            if (entity.dead) continue;

            if (entity.kind === "ship") {
                entity.render(context);
            } else if (typeof entity.render === "function") {
                entity.render(context);
            }
        }

        context.restore();
    }

    function update(dt) {
        world.step(dt);

        const now = performance.now();

        if (!network.joined) return;
        if (now - lastInputSend < 1000 / 30) return;

        const state = input.getState();

        const command = {
            throttle: state.forward ? 1 : state.backward ? -1 : 0,
            turn: state.left ? -1 : state.right ? 1 : 0,
            shoot: input.isPressed("Space")
        };

        world.predictNetworkInput(command);
        network.sendInput(command);

        lastInputSend = now;
    }

    loop = createLoop({
        update,
        render,
        fixedDt: 1 / 60
    });

    network.join(room.id, playerName);

    loop.start();

    chatForm.addEventListener("submit", event => {
        event.preventDefault();

        const text = chatInput.value.trim();

        if (!text) return;

        network.sendChat(text);
        chatInput.value = "";
    });

    window.addEventListener("keydown", event => {
        if (event.code === "Escape") {
            stopGame();
        }
    });
}

function stopGame() {
    loop?.stop();
    loop = null;

    network.close();
    world = null;

    gameScreen.hidden = true;

    lobbyUI.show();

    connectionLabel.textContent = "Відключено";
    chatMessages.replaceChildren();
}

lobby.addEventListener("join", event => {
    const { playerName: name, room } = event.detail;

    startGame(room, name);
});

network.addEventListener("error", event => {
    addChatMessage(event.detail.message || "Помилка сервера");
});

window.addEventListener("beforeunload", () => {
    loop?.stop();

    network.close();
    lobbyUI.destroy();
    input.destroy();
});

lobbyUI.show();
