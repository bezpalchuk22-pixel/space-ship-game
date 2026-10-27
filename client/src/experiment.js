import { blockingExperiment } from './experiments.js';
import { createIntervalLoop } from './intervalExperiment.js';

const result = document.querySelector('#result');

function measureRaf() {
    let frames = 0;
    let lastTime = performance.now();
    const startTime = lastTime;

    function frame(time) {
        frames += 1;

        if (time - startTime < 3000) {
            requestAnimationFrame(frame);
        } else {
            const fps =
                frames / ((time - startTime) / 1000);

            result.textContent +=
                `requestAnimationFrame: ${fps.toFixed(2)} FPS\n`;
        }

        lastTime = time;
    }

    requestAnimationFrame(frame);
}

document
    .querySelector('#blocking')
    .addEventListener('click', () => {
        const start = performance.now();

        blockingExperiment(1000);

        const duration = performance.now() - start;

        result.textContent =
            `Blocking loop:\n` +
            `Блокування головного потоку: ` +
            `${duration.toFixed(2)} мс\n\n`;

        measureRaf();
    });

document
    .querySelector('#interval')
    .addEventListener('click', () => {
        let ticks = 0;

        const start = performance.now();

        const stop = createIntervalLoop(() => {
            ticks += 1;
        });

        setTimeout(() => {
            stop();

            const duration =
                performance.now() - start;

            const frequency =
                ticks / (duration / 1000);

            result.textContent =
                `setInterval:\n` +
                `Кількість викликів: ${ticks}\n` +
                `Частота: ${frequency.toFixed(2)} разів/с\n`;
        }, 3000);
    });

document
    .querySelector('#variable')
    .addEventListener('click', () => {
        let frames = 0;
        let totalDt = 0;

        let previous = performance.now();
        const start = previous;

        function frame(time) {
            const dt = (time - previous) / 1000;

            previous = time;

            totalDt += dt;
            frames += 1;

            if (time - start < 3000) {
                requestAnimationFrame(frame);
            } else {
                const averageDt =
                    totalDt / frames;

                result.textContent =
                    `Variable timestep:\n` +
                    `Кадрів: ${frames}\n` +
                    `Середній dt: ` +
                    `${(averageDt * 1000).toFixed(2)} мс\n` +
                    `Орієнтовна частота: ` +
                    `${(1 / averageDt).toFixed(2)} разів/с\n`;
            }
        }

        requestAnimationFrame(frame);
    });