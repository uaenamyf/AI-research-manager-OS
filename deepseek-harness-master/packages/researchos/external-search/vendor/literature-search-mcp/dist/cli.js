#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { HistoryStore } from "./history.js";
export async function runCli(args = process.argv.slice(2)) {
    const [command] = args;
    if (command !== "clear-history") {
        console.error("Usage: literature-search-mcp-cli clear-history");
        return 1;
    }
    const history = new HistoryStore();
    await history.clear();
    console.log(`Cleared literature search history: ${history.path}`);
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli()
        .then((code) => {
        process.exitCode = code;
    })
        .catch((error) => {
        console.error(`Unable to clear history: ${error instanceof Error ? error.message : "unknown error"}`);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=cli.js.map