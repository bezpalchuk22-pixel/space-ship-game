
import { gameEvents } from "../events/GameEvents.js";

export class AudioManager {
    constructor() {
        this.context = null;
        this.buffers = new Map();
        this.enabled = true;

        this.handleFired = () => this.play("fired");
        this.handleHit = () => this.play("hit");
        this.handleExploded = () => this.play("exploded");

        gameEvents.addEventListener("fired", this.handleFired);
        gameEvents.addEventListener("hit", this.handleHit);
        gameEvents.addEventListener("exploded", this.handleExploded);
    }

    // Викликати після натискання кнопки гравцем.
    async initialize() {
        if (!this.context) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error("Web Audio API не підтримується цим браузером");
            }

            this.context = new AudioContextClass();
        }

        if (this.context.state === "suspended") {
            await this.context.resume();
        }
    }

    // Аудіофайли завантажуються заздалегідь,
    // а декодування відбувається після створення AudioContext.
    async decodeBuffers(audioResources) {
        await this.initialize();

        for (const [id, arrayBuffer] of Object.entries(audioResources)) {
            try {
                const buffer = await this.context.decodeAudioData(
                    arrayBuffer.slice(0)
                );

                this.buffers.set(id, buffer);
            } catch (error) {
                console.warn(`Не вдалося декодувати звук "${id}"`, error);
            }
        }
    }

    play(id) {
        if (!this.enabled || !this.context) return;

        const buffer = this.buffers.get(id);
        if (!buffer) return;

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        source.start();
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
    }

    destroy() {
        gameEvents.removeEventListener("fired", this.handleFired);
        gameEvents.removeEventListener("hit", this.handleHit);
        gameEvents.removeEventListener("exploded", this.handleExploded);

        if (this.context) {
            void this.context.close();
            this.context = null;
        }

        this.buffers.clear();
    }
}
