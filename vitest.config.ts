
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: [
            "shared/**/*.test.ts",
            "client/src/**/*.test.ts",
            "server/src/**/*.test.ts"
        ],
        environment: "node",
        coverage: {
            provider: "v8",
            include: ["shared/**/*.ts"],
            exclude: ["shared/**/*.test.ts"],
            thresholds: {
                statements: 85,
                branches: 85,
                functions: 85,
                lines: 85
            }
        }
    }
});
