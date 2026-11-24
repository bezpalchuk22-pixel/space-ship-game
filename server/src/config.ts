
import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
    PORT: z.coerce.number()
        .int("PORT має бути цілим числом")
        .min(1, "PORT має бути від 1 до 65535")
        .max(65535, "PORT має бути від 1 до 65535")
        .default(3000),

    LOG_DIR: z.string()
        .trim()
        .min(1, "LOG_DIR має містити шлях до каталогу")
        .default("./logs"),

    ALLOWED_ORIGINS: z.string()
        .default("http://localhost:5173,http://localhost:5174,http://localhost:3000"),

    MAX_CONNECTIONS_PER_IP: z.coerce.number()
        .int()
        .min(1)
        .max(100)
        .default(5),

    MAX_ROOMS: z.coerce.number()
        .int()
        .min(5)
        .max(1000)
        .default(20),

    MAX_PLAYERS_PER_ROOM: z.coerce.number()
        .int()
        .min(2)
        .max(32)
        .default(4)
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
    console.error("Помилка конфігурації сервера:");
    console.error(z.prettifyError(parsedConfig.error));
    throw new Error("Invalid server configuration");
}

export const config = Object.freeze({
    port: parsedConfig.data.PORT,
    logDir: path.resolve(parsedConfig.data.LOG_DIR),
    allowedOrigins: parsedConfig.data.ALLOWED_ORIGINS
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean),
    maxConnectionsPerIp: parsedConfig.data.MAX_CONNECTIONS_PER_IP,
    maxRooms: parsedConfig.data.MAX_ROOMS,
    maxPlayersPerRoom: parsedConfig.data.MAX_PLAYERS_PER_ROOM
});
