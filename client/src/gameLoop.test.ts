
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoop } from "./gameLoop.js";

describe("GameLoop", () => {
    let callbacks: FrameRequestCallback[];
let update: ReturnType<typeof vi.fn<(fixedDt: number) => void>>;
let render: ReturnType<typeof vi.fn<(alpha: number) => void>>;

       beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);

        callbacks = [];

        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            callbacks.push(callback);
            return callbacks.length;
        });

        update = vi.fn<(fixedDt: number) => void>();
        render = vi.fn<(alpha: number) => void>();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function frame(time: number): void {
        const callback = callbacks.shift();

        if (!callback) {
            throw new Error("No animation frame scheduled");
        }

        callback(time);
    }

    it("starts and schedules the first animation frame", () => {
        const loop = createLoop({ update, render });

        loop.start();

        expect(callbacks).toHaveLength(1);
        expect(update).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it("does not schedule duplicate loops when started twice", () => {
        const loop = createLoop({ update, render });

        loop.start();
        loop.start();

        expect(callbacks).toHaveLength(1);
    });

    it("renders a frame without updating on the first frame", () => {
        const loop = createLoop({ update, render });

        loop.start();
        frame(16);

        expect(update).not.toHaveBeenCalled();
        expect(render).toHaveBeenCalledTimes(1);
        expect(render).toHaveBeenCalledWith(0);
        expect(callbacks).toHaveLength(1);
    });

    it("performs fixed updates when enough time has accumulated", () => {
        const loop = createLoop({
            update,
            render,
            fixedDt: 0.01
        });

        loop.start();
        frame(1);
        frame(26);

        expect(update).toHaveBeenCalledTimes(2);
        expect(update).toHaveBeenCalledWith(0.01);
    });

    it("uses the remaining accumulator to calculate interpolation alpha", () => {
        const loop = createLoop({
            update,
            render,
            fixedDt: 0.01
        });

        loop.start();
        frame(1);
        frame(16);

        expect(update).toHaveBeenCalledTimes(1);
        expect(render).toHaveBeenLastCalledWith(
            expect.closeTo(0.5)
        );
    });

    it("limits a large frame delta to 250 milliseconds", () => {
        const loop = createLoop({
            update,
            render,
            fixedDt: 0.01
        });

        loop.start();
        frame(1);
        frame(1001);

        expect(update).toHaveBeenCalledTimes(25);
    });

    it("does not execute callbacks after stop", () => {
        const loop = createLoop({ update, render });

        loop.start();
        loop.stop();
        frame(16);

        expect(update).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
        expect(callbacks).toHaveLength(0);
    });

    it("can restart after being stopped", () => {
        const loop = createLoop({ update, render });

        loop.start();
        loop.stop();
        loop.start();

        expect(callbacks).toHaveLength(2);

        frame(16);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it("reports frame time through getStats", () => {
        const loop = createLoop({ update, render });

        loop.start();
        frame(1);
        frame(21);

        expect(loop.getStats().frameTime).toBe(20);
    });

    it("updates FPS and steps per second after one second", () => {
        const loop = createLoop({
            update,
            render,
            fixedDt: 0.01
        });

        loop.start();
        frame(1);
        frame(1001);

        const stats = loop.getStats();

        expect(stats.stepsPerSecond).toBe(25);
        expect(stats.framesPerSecond).toBe(2);
    });

    it("rejects zero, negative and non-finite fixed time steps", () => {
        for (const fixedDt of [0, -1, Infinity, NaN]) {
            expect(() => createLoop({
                update,
                render,
                fixedDt
            })).toThrow();
        }
    });
});
