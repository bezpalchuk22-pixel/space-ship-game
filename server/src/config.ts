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
        .default("./logs")
});

const parsedConfig = configSchema.safeParse(process.env);

if (!parsedConfig.success) {
    console.error("Помилка конфігурації сервера:");
    console.error(z.prettifyError(parsedConfig.error));
    throw new Error("Invalid server configuration");
}

export const config = Object.freeze({
    port: parsedConfig.data.PORT,
    logDir: path.resolve(parsedConfig.data.LOG_DIR)
});
