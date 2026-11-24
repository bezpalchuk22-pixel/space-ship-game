import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface MatchLogEvent {
    readonly [key: string]: unknown;
}

export interface MatchLogger {
    readonly filePath: string;
    write(event: MatchLogEvent): boolean;
    close(): Promise<void>;
}

export function createMatchLogger(logDir: string): MatchLogger {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(logDir, `matches-${timestamp}.ndjson`);

    const source = new PassThrough({
        objectMode: true,
        highWaterMark: 64
    });

    const formatter = new Transform({
        writableObjectMode: true,

        transform(
            event: MatchLogEvent,
            _encoding: BufferEncoding,
            callback: (error: Error | null, data?: string) => void
        ): void {
            try {
                callback(null, JSON.stringify(event) + "\n");
            } catch (error: unknown) {
                callback(
                    error instanceof Error
                        ? error
                        : new Error("Failed to serialize log event")
                );
            }
        }
    });

    const output = createWriteStream(filePath, {
        flags: "a"
    });

    const completion = pipeline(source, formatter, output);

    completion.catch((error: unknown) => {
        console.error("Помилка потоку журналювання:", error);
    });

    let closed = false;

    return {
        filePath,

        write(event: MatchLogEvent): boolean {
            if (closed) return false;
            return source.write(event);
        },

        async close(): Promise<void> {
            if (closed) {
                await completion;
                return;
            }

            closed = true;
            source.end();

            await completion;
        }
    };
}
