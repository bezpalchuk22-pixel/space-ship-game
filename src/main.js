
import "./style.css";

import { Vector2 } from "./entities/Vector2.js";
import { Ship } from "./entities/Ship.js";
import { World } from "./entities/World.js";

import { fetchJson, loadAll } from "./assets/AssetLoader.js";
import { AudioManager } from "./audio/AudioManager.js";
import { gameEvents } from "./events/GameEvents.js";
import { Lobby } from "./lobby/Lobby.js";
import { LobbyUI } from "./lobby/LobbyUI.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreElement = document.querySelector("#score");
const hpElement = document.querySelector("#hp");
const entitiesElement = document.querySelector("#entities");

const world = new World(window.innerWidth, window.innerHeight);

let gameStarted = false;
let previousTime = 0;
let accumulator = 0;
let audioManager = null;
let loadedAssets = null;
let loadingController = null;

const fixedStep = 1 / 60;
const maxFrameTime = 0.1;

// Елементи екрана завантаження.
const loadingScreen = document.createElement("section");
loadingScreen.className = "loading-screen";
loadingScreen.hidden = true;
loadingScreen.innerHTML = `
  <div class="loading-panel">
    <h2>Завантаження гри</h2>
    <p id="loading-message">Підготовка ресурсів...</p>
    <div class="loading-track">
      <div id="loading-progress"></div>
    </div>
    <p id="loading-percent">0%</p>
    <button id="loading-retry" type="button" hidden>
      Retry
    </button>
  </div>
`;
document.body.appendChild(loadingScreen);

const loadingMessage = loadingScreen.querySelector("#loading-message");
const loadingProgress = loadingScreen.querySelector("#loading-progress");
const loadingPercent = loadingScreen.querySelector("#loading-percent");
const retryButton = loadingScreen.querySelector("#loading-retry");

function showLoading(message = "Підготовка ресурсів...") {
    loadingScreen.hidden = false;
    loadingMessage.textContent = message;
    loadingProgress.style.width = "0%";
    loadingPercent.textContent = "0%";
    retryButton.hidden = true;
}

function hideLoading() {
    loadingScreen.hidden = true;
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(world.width * dpr);
    canvas.height = Math.floor(world.height * dpr);
    canvas.style.width = `${world.width}px`;
    canvas.style.height = `${world.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", () => {
    if (gameStarted) {
        world.width = window.innerWidth;
        world.height = window.innerHeight;
    }

    resizeCanvas();
});

resizeCanvas();

// ------------------------------
// Завантаження ресурсів
// ------------------------------

async function loadGameAssets() {
    loadingController?.abort();
    loadingController = new AbortController();

    showLoading("Завантаження ресурсів...");

    try {
        const manifest = await fetchJson(
            "/assets/manifest.json",
            loadingController.signal
        );

        loadedAssets = await loadAll(manifest, {
            signal: loadingController.signal,
            onProgress(progress) {
                loadingProgress.style.width = `${progress.percent}%`;
                loadingPercent.textContent = `${progress.percent}%`;

                loadingMessage.textContent = progress.current
                    ? `Завантаження: ${progress.current}`
                    : "Підготовка ресурсів...";
            }
        });

        // Створення AudioContext відбувається після жесту користувача
        // через кнопку Join. Тут декодуємо вже завантажені аудіодані,
        // коли AudioContext створений.
        if (audioManager?.context) {
            const audioResources = {};

            for (const item of manifest.audio ?? []) {
                audioResources[item.id] = loadedAssets[item.id];
            }

            await audioManager.decodeBuffers(audioResources);
        }

        loadingMessage.textContent = "Ресурси завантажено";
        loadingProgress.style.width = "100%";
        loadingPercent.textContent = "100%";

        return true;
    } catch (error) {
        console.error("Помилка завантаження ресурсів:", error);

        loadingMessage.textContent =
            "Не вдалося завантажити ресурси. Перевір файли та повтори спробу.";

        retryButton.hidden = false;
        return false;
    }
}

// ------------------------------
// Запуск гри
// ------------------------------

function startGame(room, playerName) {
    world.width = room.width || window.innerWidth;
    world.height = room.height || window.innerHeight;

    resizeCanvas();

    // Зберігаємо ім'я гравця для подальшого використання.
    world.playerName = playerName;

    world.spawn(
        new Ship(new Vector2(world.width / 2, world.height / 2), true)
    );

    for (let i = 0; i < 7; i++) {
        world.spawnAsteroid();
    }

    world.spawnPickup();

    gameStarted = true;
    previousTime = 0;
    accumulator = 0;

    hideLoading();
    requestAnimationFrame(gameLoop);
}

// ------------------------------
// Керування кораблем
// ------------------------------

const shipKeys = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
]);

window.addEventListener("keydown", (event) => {
    if (shipKeys.has(event.code) || event.code === "Space") {
        event.preventDefault();
    }

    if (!gameStarted) return;

    const ship = world.player;
    if (!ship || ship.dead) return;

    ship.keys.add(event.code);

    if (event.code === "Space" && !event.repeat) {
        ship.fire(world);
        gameEvents.emit("fired");
    }

    if (event.code === "KeyH" && !event.repeat) {
        ship.fire(world, true);
        gameEvents.emit("fired");
    }

    if (event.code === "KeyP" && !event.repeat) {
        world.spawnPickup();
    }
});

window.addEventListener("keyup", (event) => {
    world.player?.keys.delete(event.code);
});

window.addEventListener("blur", () => {
    world.player?.keys.clear();
});

// ------------------------------
// Ігровий цикл
// ------------------------------

function gameLoop(timestamp) {
    if (!gameStarted) return;

    if (previousTime === 0) previousTime = timestamp;

    const frameTime = Math.min(
        (timestamp - previousTime) / 1000,
        maxFrameTime
    );

    previousTime = timestamp;
    accumulator += frameTime;

    while (accumulator >= fixedStep) {
        world.step(fixedStep);
        accumulator -= fixedStep;
    }

    ctx.clearRect(0, 0, world.width, world.height);
    world.render(ctx);

    scoreElement.textContent = String(world.score);
    hpElement.textContent = world.player
        ? String(world.player.hp)
        : "Відродження...";
    entitiesElement.textContent = String(world.entities.size);

    requestAnimationFrame(gameLoop);
}

// ------------------------------
// Лобі
// ------------------------------

const lobby = new Lobby();
const lobbyUI = new LobbyUI(lobby);

lobby.addEventListener("join", async (event) => {
    const { playerName, room } = event.detail;

    try {
        // Жест користувача дозволяє створити/відновити AudioContext.
        audioManager ??= new AudioManager();

        try {
            await audioManager.initialize();
        } catch (audioError) {
            console.warn("Аудіо недоступне:", audioError);
        }

        showLoading("Підготовка до запуску...");

        const success = await loadGameAssets();

        if (!success) {
            return;
        }

        // Декодуємо аудіо після ініціалізації AudioContext.
        if (audioManager.context) {
            const manifest = await fetchJson("/assets/manifest.json");
            const audioResources = {};

            for (const item of manifest.audio ?? []) {
                audioResources[item.id] = loadedAssets[item.id];
            }

            await audioManager.decodeBuffers(audioResources);
        }

        startGame(room, playerName);
    } catch (error) {
        console.error("Не вдалося запустити гру:", error);
        showLoading("Помилка запуску. Натисни Retry.");
        retryButton.hidden = false;
    }
});

retryButton.addEventListener("click", async () => {
    const playerName = lobbyUI.nameInput.value;
    const roomId = lobbyUI.roomsSelect.value;
    const room = lobby.rooms.find(
        item => String(item.id) === String(roomId)
    );

    if (!playerName.trim() || !room) {
        hideLoading();
        lobbyUI.show();
        return;
    }

    try {
        audioManager ??= new AudioManager();

        try {
            await audioManager.initialize();
        } catch (error) {
            console.warn("Аудіо недоступне:", error);
        }

        const success = await loadGameAssets();

        if (success) {
            startGame(room, playerName.trim());
        }
    } catch (error) {
        console.error(error);
        loadingMessage.textContent = "Повторна спроба не вдалася.";
        retryButton.hidden = false;
    }
});

lobbyUI.show();
