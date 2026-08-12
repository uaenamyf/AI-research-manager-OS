export const pubmedXml = `<?xml version="1.0"?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345</PMID>
      <Article>
        <ArticleTitle>Example <i>biomedical</i> discovery</ArticleTitle>
        <Abstract><AbstractText Label="BACKGROUND">A useful abstract about cells.</AbstractText></Abstract>
        <AuthorList><Author><ForeName>Ada</ForeName><LastName>Lovelace</LastName></Author></AuthorList>
        <Journal><Title>Journal of Examples</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue></Journal>
      </Article>
    </MedlineCitation>
    <PubmedData><ArticleIdList>
      <ArticleId IdType="pubmed">12345</ArticleId>
      <ArticleId IdType="doi">10.1000/Example</ArticleId>
      <ArticleId IdType="pmc">PMC999</ArticleId>
    </ArticleIdList></PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`

export const europePmcJson = {
  resultList: {
    result: [
      {
        id: "12345",
        source: "MED",
        pmid: "12345",
        pmcid: "PMC999",
        doi: "10.1000/example",
        title: "Example biomedical discovery",
        abstractText: "A useful abstract from Europe PMC.",
        authorList: { author: [{ fullName: "Ada Lovelace" }] },
        journalInfo: { journal: { title: "Journal of Examples" } },
        pubYear: "2024",
        isOpenAccess: "Y",
        hasPDF: "Y",
      },
    ],
  },
}

export const biorxivJson = {
  collection: [
    {
      doi: "10.1101/2024.01.02.123456",
      title: "A preprint fixture",
      authors: "Ada Lovelace; Alan Turing",
      abstract: "Preprint abstract.",
      category: "bioinformatics",
      date: "2024-01-02",
      version: "2",
      server: "biorxiv",
    },
  ],
}

export const crossrefJson = {
  message: {
    items: [
      {
        DOI: "10.1000/example",
        title: ["Example biomedical discovery"],
        abstract: "<jats:p>Crossref abstract.</jats:p>",
        author: [{ given: "Ada", family: "Lovelace" }],
        "container-title": ["Journal of Examples"],
        URL: "https://doi.org/10.1000/example",
        issued: { "date-parts": [[2024, 1, 2]] },
        link: [{ URL: "https://example.test/paper.pdf", "content-type": "application/pdf" }],
        license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }],
      },
    ],
  },
}

export const openAlexJson = {
  results: [
    {
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/example",
      display_name: "Example biomedical discovery",
      publication_year: 2024,
      abstract_inverted_index: { Example: [0], abstract: [1], text: [2] },
      authorships: [{ author: { display_name: "Ada Lovelace" } }],
      primary_location: { landing_page_url: "https://example.test/work", source: { display_name: "Journal of Examples" } },
      best_oa_location: {
        landing_page_url: "https://example.test/open",
        pdf_url: "https://example.test/open.pdf",
        source: { display_name: "Journal of Examples" },
      },
      open_access: { is_oa: true, oa_url: "https://example.test/open" },
    },
  ],
}

export const semanticScholarJson = {
  data: [
    {
      paperId: "S2-123",
      title: "Example biomedical discovery",
      abstract: "Semantic Scholar abstract.",
      url: "https://www.semanticscholar.org/paper/S2-123",
      year: 2024,
      venue: "Journal of Examples",
      authors: [{ name: "Ada Lovelace" }],
      externalIds: { DOI: "10.1000/example", PubMed: "12345", ArXiv: "2401.01234v2" },
      openAccessPdf: { url: "https://example.test/s2.pdf", status: "GOLD" },
    },
  ],
}

export const arxivXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2401.01234v2</id>
    <updated>2024-01-03T00:00:00Z</updated>
    <published>2024-01-02T00:00:00Z</published>
    <title>An arXiv fixture</title>
    <summary>ArXiv abstract text.</summary>
    <author><name>Ada Lovelace</name></author>
    <arxiv:doi>10.1000/arxiv-example</arxiv:doi>
    <arxiv:primary_category term="cs.LG" />
    <link href="https://arxiv.org/pdf/2401.01234v2" title="pdf" type="application/pdf" />
  </entry>
</feed>`
