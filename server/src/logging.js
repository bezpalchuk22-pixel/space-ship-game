
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export function createMatchLogger(logDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = join(logDir, `matches-${timestamp}.ndjson`);

    const source = new PassThrough({
        objectMode: true,
        highWaterMark: 64
    });

    const formatter = new Transform({
        writableObjectMode: true,

        transform(event, encoding, callback) {
            try {
                callback(null, JSON.stringify(event) + "\n");
            } catch (error) {
                callback(error);
            }
        }
    });

    const output = createWriteStream(filePath, {
        flags: "a"
    });

    const completion = pipeline(source, formatter, output);

    completion.catch(error => {
        console.error("Помилка потоку журналювання:", error);
    });

    let closed = false;

    return {
        filePath,

        write(event) {
            if (closed) return false;
            return source.write(event);
        },

        async close() {
            if (closed) {
                return completion;
            }

            closed = true;
            source.end();

            await completion;
        }
    };
}
