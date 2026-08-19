import type { LiteratureResult, ProviderPaper, SourceId } from "./types.js";
export interface RankedProviderResult {
    source: SourceId;
    papers: ProviderPaper[];
}
export declare function deduplicateAndFuse(providerResults: RankedProviderResult[], limit: number): LiteratureResult[];
