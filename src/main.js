
import "./style.css";

import { Vector2 } from "./entities/Vector2.js";
import { Ship } from "./entities/Ship.js";
import { World } from "./entities/World.js";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const hpElement = document.querySelector("#hp");
const entitiesElement = document.querySelector("#entities");

const world = new World(window.innerWidth, window.innerHeight);

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    world.width = window.innerWidth;
    world.height = window.innerHeight;

    canvas.width = Math.floor(world.width * dpr);
    canvas.height = Math.floor(world.height * dpr);
    canvas.style.width = `${world.width}px`;
    canvas.style.height = `${world.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

world.spawn(
    new Ship(new Vector2(world.width / 2, world.height / 2), true)
);

for (let i = 0; i < 7; i++) {
    world.spawnAsteroid();
}

world.spawnPickup();

const shipKeys = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
]);

window.addEventListener("keydown", (event) => {
    if (shipKeys.has(event.code) || event.code === "Space") {
        event.preventDefault();
    }

    const ship = world.player;
    if (!ship || ship.dead) return;

    ship.keys.add(event.code);

    if (event.code === "Space" && !event.repeat) {
        ship.fire(world);
    }

    if (event.code === "KeyH" && !event.repeat) {
        ship.fire(world, true);
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

let previousTime = 0;
let accumulator = 0;

const fixedStep = 1 / 60;
const maxFrameTime = 0.1;

function gameLoop(timestamp) {
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

requestAnimationFrame(gameLoop);
