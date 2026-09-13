import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests cover the pure logic in src/utils only: price/deal decisions and
// the parsing of external API payloads. Everything else in the plugin needs a
// live Steam client or the Decky runtime, so it is verified on-device instead.
export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
        environment: "node",
    },
    resolve: {
        alias: {
            // The real library only loads inside the Steam client - see the stub.
            "@decky/ui": fileURLToPath(
                new URL("./src/test/decky-ui.stub.ts", import.meta.url)
            ),
        },
    },
});
