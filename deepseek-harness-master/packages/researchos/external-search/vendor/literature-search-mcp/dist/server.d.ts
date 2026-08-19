#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LiteratureSearchService } from "./service.js";
import type { LiteratureProvider } from "./types.js";
export interface LiteratureServerOptions {
    service?: LiteratureSearchService;
    providers?: LiteratureProvider[];
}
export declare function createLiteratureServer(options?: LiteratureServerOptions): McpServer;
export declare function main(): Promise<void>;
