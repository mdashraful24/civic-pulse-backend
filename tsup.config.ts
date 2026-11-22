import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        server: "src/server.ts",
        "workers/email.worker": "src/app/workers/email.worker.ts",
    },
    format: ["esm"], // Keep this as ESM
    target: "esnext",
    outDir: "dist",
    clean: true,
    bundle: true,
    splitting: false,
    sourcemap: true,
    // Add this banner to shim require() for CJS dependencies
    banner: {
        js: `
            import { createRequire } from 'module';
            const require = createRequire(import.meta.url);
        `,
    },
});