import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "node_modules/**",
            "client/dist/**",
            "coverage/**",
            "test-results/**",
            "playwright-report/**"
        ]
    },
    ...tseslint.configs.recommended
);
