
import { gameEvents } from "../events/GameEvents.ts";

declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export type AudioResourceMap = Readonly<Record<string, ArrayBuffer>>;


export class AudioManager {
    private context: AudioContext | null = null;
    private readonly buffers = new Map<string, AudioBuffer>();
    private enabled = true;

    private readonly handleFired = (): void => this.play("fired");
    private readonly handleHit = (): void => this.play("hit");
    private readonly handleExploded = (): void => this.play("exploded");

    constructor() {
        gameEvents.addEventListener("fired", this.handleFired);
        gameEvents.addEventListener("hit", this.handleHit);
        gameEvents.addEventListener("exploded", this.handleExploded);
    }

    async initialize(): Promise<void> {
        if (!this.context) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) {
                throw new Error(
                    "Web Audio API не підтримується цим браузером."
                );
            }

            this.context = new AudioContextClass();
        }

        if (this.context.state === "suspended") {
            await this.context.resume();
        }
    }

    async decodeBuffers(audioResources: AudioResourceMap): Promise<void> {
        await this.initialize();

        const context = this.context;

        if (!context) {
            throw new Error("AudioContext не ініціалізовано.");
        }

        for (const [id, arrayBuffer] of Object.entries(audioResources)) {
            try {
                const buffer = await context.decodeAudioData(
                    arrayBuffer.slice(0)
                );

                this.buffers.set(id, buffer);
            } catch (error: unknown) {
                console.warn(
                    `Не вдалося декодувати звук "${id}"`,
                    error
                );
            }
        }
    }

    play(id: string): void {
        if (!this.enabled || !this.context) {
            return;
        }

        const buffer = this.buffers.get(id);

        if (!buffer) {
            return;
        }

        const source = this.context.createBufferSource();

        source.buffer = buffer;
        source.connect(this.context.destination);
        source.start();
    }

    setEnabled(enabled: boolean): void {
        this.enabled = Boolean(enabled);
    }

    destroy(): void {
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
