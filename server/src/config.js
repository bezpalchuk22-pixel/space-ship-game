import path from "node:path";

function readPort(value) {
    const port = Number(value ?? 3000);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT має бути цілим числом від 1 до 65535");
    }

    return port;
}

function readLogDir(value) {
    const logDir = value ?? "./logs";

    if (typeof logDir !== "string" || logDir.trim() === "") {
        throw new Error("LOG_DIR має містити шлях до каталогу логів");
    }

    return path.resolve(logDir);
}

export const config = Object.freeze({
    port: readPort(process.env.PORT),
    logDir: readLogDir(process.env.LOG_DIR)
});