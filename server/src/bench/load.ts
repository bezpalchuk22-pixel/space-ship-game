import { performance } from "node:perf_hooks";
import { GameSimulation } from "../game/GameSimulation.js";
import { toPlayerId, toSequenceNumber } from "../../../shared/Types.js";

const CLIENT_COUNTS = [8, 32, 64, 128];
const WARMUP_TICKS = 60;
const MEASURE_TICKS = 300;
const TICK_BUDGET_MS = 1000 / 30;

function percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
    return sorted[index] ?? 0;
}

for (const clientCount of CLIENT_COUNTS) {
    const simulation = new GameSimulation(`load-test-${clientCount}`);

    const players = Array.from(
        { length: clientCount },
        (_, index) => toPlayerId(`bot-${index + 1}`)
    );

    for (const playerId of players) {
        simulation.addPlayer(playerId);
    }

    const durations: number[] = [];
    const totalTicks = WARMUP_TICKS + MEASURE_TICKS;

    for (let tick = 0; tick < totalTicks; tick++) {
        const startedAt = performance.now();

        for (let i = 0; i < players.length; i++) {
            simulation.handleInput(players[i]!, {
                seq: toSequenceNumber(tick + 1),
                throttle: 0.7,
                turn: ((tick + i) % 3 - 1) * 0.2,
                shoot: tick % 9 === 0
            });
        }

        simulation.step();

        const elapsed = performance.now() - startedAt;

        if (tick >= WARMUP_TICKS) {
            durations.push(elapsed);
        }
    }

    const average = durations.reduce((sum, value) => sum + value, 0)
        / durations.length;

    const overBudget = durations.filter(
        value => value > TICK_BUDGET_MS
    ).length;

    console.log(`\n=== ${clientCount} CLIENTS ===`);
    console.log(`Ticks measured: ${durations.length}`);
    console.log(`Average: ${average.toFixed(3)} ms`);
    console.log(`p50: ${percentile(durations, 0.50).toFixed(3)} ms`);
    console.log(`p95: ${percentile(durations, 0.95).toFixed(3)} ms`);
    console.log(`p99: ${percentile(durations, 0.99).toFixed(3)} ms`);
    console.log(`Max: ${Math.max(...durations).toFixed(3)} ms`);
    console.log(`Over 33.33 ms: ${overBudget}`);
}

console.log("\nLoad test completed.");
