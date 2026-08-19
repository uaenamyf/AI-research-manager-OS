# Literature providers

The server uses public metadata/search APIs and returns metadata plus truncated abstracts or summaries. It does not download article full text, traverse citation graphs, or fetch cited/reference records.

| Source ID | API | Search and filtering notes | Optional configuration |
|---|---|---|---|
| `pubmed` | NCBI E-utilities (`ESearch` + `EFetch`) | Relevance search, publication-year query clauses, and `free full text[sb]` for `open_access`. Requests include the `tool` parameter. Keyless pacing is 3 requests/second; keyed pacing is 10 requests/second. | `NCBI_TOOL`, `NCBI_EMAIL`, `NCBI_API_KEY` |
| `europepmc` | Europe PMC REST search | `resultType=core` supplies abstracts. Supports first-publication-date and `OPEN_ACCESS:Y` filters. | None |
| `biorxiv` | bioRxiv API (`api.biorxiv.org/details`) | The public API has no full-text search. DOI-shaped queries use exact DOI lookup. Other queries cursor-page through a bounded recent window (maximum 200 records per backend) from bioRxiv and medRxiv and rank term overlap locally. A recoverable failure of one backend/page is reported in source warnings. Preprints are treated as openly accessible. | None |
| `crossref` | Crossref REST works search | Supports publication-date filters. Open-access filtering is applied after normalization; a recognized open license or a direct PDF is positive access evidence. Crossref metadata often lacks abstracts and direct PDFs. | `CROSSREF_MAILTO` |
| `openalex` | OpenAlex Works API | Supports publication dates and the current `is_oa:true` filter. Reconstructs abstracts from the inverted index and uses best open-access locations when present. | `OPENALEX_MAILTO`, `OPENALEX_API_KEY` |
| `semantic-scholar` | Semantic Scholar Academic Graph | Supports year ranges. Open-access filtering is enforced after parsing from `openAccessPdf`; no citation or reference fields are requested. Keyless requests are paced conservatively. | `SEMANTIC_SCHOLAR_API_KEY` |
| `arxiv` | arXiv Atom API | Supports native fielded queries and submitted-date ranges. Every record is openly accessible. Requests use a 3-second minimum start interval and maximum concurrency of 1. | None |

## Open-access interpretation

`open_access: true` is conservative: a record is retained only when the provider supplies positive open-access evidence or a usable PDF URL. Provider definitions differ, so this is an access-oriented filter rather than a legal conclusion about reuse rights.

## Provider failures

Each source runs independently. Statuses distinguish `ok`, `empty`, `rate_limited`, `timeout`, and `error`; recoverable sub-backend failures appear as warnings. Successful sources still contribute results. If every selected source fails, `literature_search` returns a normal structured response with `all_sources_failed: true` and an empty `results` array.
