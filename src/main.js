import './style.css';

import { createInput } from './input.js';
import { integrate } from './physics.js';
import { createRenderer } from './renderer.js';
import { createLoop } from './gameLoop.js';

const canvas = document.querySelector('#gameCanvas');

const stepsElement = document.querySelector('#steps');
const framesElement = document.querySelector('#frames');
const frameTimeElement =
    document.querySelector('#frameTime');

const input = createInput();
const renderer = createRenderer(canvas);

const ship = {
    x: renderer.getWidth() / 2,
    y: renderer.getHeight() / 2,

    previousX: renderer.getWidth() / 2,
    previousY: renderer.getHeight() / 2,

    angle: -Math.PI / 2,
    previousAngle: -Math.PI / 2,

    vx: 0,
    vy: 0,

    renderX: 0,
    renderY: 0,
    renderAngle: 0,

    thrust: false,
};

function update(dt) {
    ship.previousX = ship.x;
    ship.previousY = ship.y;
    ship.previousAngle = ship.angle;

    const inputState = input.getState();

    ship.thrust = inputState.forward;

    integrate(
        ship,
        inputState,
        dt,
        renderer.getWidth(),
        renderer.getHeight(),
    );
}

function render(alpha) {
    renderer.render(ship, alpha);

    const stats = gameLoop.getStats();

    stepsElement.textContent =
        `${stats.stepsPerSecond}`;

    framesElement.textContent =
        `${stats.framesPerSecond}`;

    frameTimeElement.textContent =
        `${stats.frameTime.toFixed(2)} ms`;
}

const gameLoop = createLoop({
    update,
    render,
    fixedDt: 1 / 60,
});

gameLoop.start();