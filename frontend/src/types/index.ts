/** 后端 API 契约的 TypeScript 类型定义，与后端 DTO 对齐。 */
// ===== 统一响应 =====
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

// ===== 分页 =====
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

// ===== 通用 =====
export type ID = number;

// ===== F1 用户账户 =====
export type Plan = "FREE" | "PRO" | "RESEARCHER";

export interface User {
  id: ID;
  email: string;
  plan: Plan;
  createdTime: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
}

// ===== F2 Project =====
export interface ResearchProject {
  id: ID;
  userId: ID;
  name: string;
  description: string;
  domain: string;
  createdTime: string;
}

export interface ProjectCreateRequest {
  name: string;
  description: string;
  domain: string;
}

// ===== Folder 文件夹 =====
export interface Folder {
  id: ID;
  userId: ID;
  projectId: ID;
  parentId: ID | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children?: Folder[]; // 前端用于构建树
}

// ===== F3 论文 =====
export type PaperStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "ANALYZED"
  | "READY"
  | "FAILED";

export interface Paper {
  id: ID;
  projectId: ID;
  userId: ID;
  folderId: ID | null;
  title: string;
  authors: string;
  year: number;
  doi: string;
  pdfUrl: string;
  status: PaperStatus;
  summary: PaperIntelligenceCard | null;
  readingStatus?: "unread" | "reading" | "done";
  starRating?: number | null;
  createdTime: string;
}

export interface PaperListItem {
  id: ID;
  title: string;
  authors: string;
  year: number;
  status: PaperStatus;
  folderId: ID | null;
  readingStatus?: "unread" | "reading" | "done";
  starRating?: number | null;
  createdTime: string;
}

/** F4 Paper Intelligence Card 结构 */
export interface PaperIntelligenceCard {
  title?: string;
  authors?: string;
  year?: number;
  journal?: string;
  keywords?: string[];
  abstract?: string;
  workflow?: string;
  researchQuestion?: string;
  method?: string;
  dataset?: string;
  mainFindings?: string;
  innovation?: string;
  limitation?: string;
  futureDirection?: string;
}

export interface PaperUploadResponse {
  paperId: ID;
  status: PaperStatus;
}

/** 上传用 presigned POST 参数 */
export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

// ===== F7 Review Assistant =====
export type AiTaskType = "PAPER_ANALYSIS" | "REVIEW_GENERATION";
export type AiTaskStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

export interface AiTask {
  taskId: ID;
  userId: ID;
  type: AiTaskType;
  status: AiTaskStatus;
  result: ReviewResult | null;
  error: string | null;
  createdTime: string;
}

export interface ReviewGenerateRequest {
  paperIds: ID[];
  topic: string;
}

export interface ReviewResult {
  markdown: string;
  paperIds: ID[];
}

// ===== Agent 4 Writing Assistant =====
export type WritingAction =
  | "rewrite"
  | "polish"
  | "review_response"
  | "cover_letter"
  | "expand"
  | "shorten"
  | "translate"
  | "rebuttal";

/** 改写请求（Assistant /rewrite）。 */
export interface WritingRewriteRequest {
  text: string;
  action: WritingAction;
  instruction?: string;
}

export interface WritingRewriteResult {
  action: string;
  text: string;
}

// ===== Agent 4.5 划词翻译（Paper Card Tab2）=====
/** 翻译方式：machine=翻译器（快），llm=大模型（准） */
export type TranslateMode = "machine" | "llm";

/** 机器翻译请求（backend /api/writing/translate-machine） */
export interface MachineTranslateRequest {
  text: string;
  targetLang?: string;
}

export interface MachineTranslateResult {
  text: string;
  sourceLang?: string;
  targetLang: string;
}

/** 划词翻译可用的目标语言（Google 语言码 → 中文名） */
export const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: "zh-CN", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "한국어" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "pt", label: "Português" },
];

// ===== 错误 =====
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ===== F8 用户设置（Settings 页面）=====
/** LLM 提供商选项 */
export const LLM_PROVIDERS: { value: string; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "doubao", label: "Doubao (Volcano Engine)" },
  { value: "qwen", label: "Qwen" },
  { value: "glm", label: "Zhipu GLM" },
];

/** 机器翻译提供商选项（mymemory 为默认：无 key、国内可达） */
export const TRANSLATE_PROVIDERS: { value: string; label: string }[] = [
  { value: "mymemory", label: "MyMemory (Free)" },
  { value: "google", label: "Google Translate" },
  { value: "deepl", label: "DeepL" },
  { value: "baidu", label: "Baidu Translate" },
  { value: "youdao", label: "Youdao Translate" },
];

/** 用户 LLM 设置 */
export interface UserLlmSettings {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  temperature?: number;
}

/** 用户翻译设置 */
export interface UserTranslationSettings {
  defaultMode?: TranslateMode;
  defaultTargetLang?: string;
  machineProvider?: string;
  machineApiKey?: string;
}

/** 用户设置（与 backend UserSettings DTO 对齐） */
export interface UserSettings {
  llm: UserLlmSettings;
  translation: UserTranslationSettings;
}

// ===== Literature Search（Review Tab 3：literature-search-mcp 学术检索）=====
/** 各数据源检索状态 */
export interface LiteratureSourceStatus {
  source: string;
  status: "ok" | "empty" | "rate_limited" | "timeout" | "error";
  result_count: number;
  duration_ms: number;
  error?: {
    type: string;
    message: string;
    status?: number;
    retryable: boolean;
  };
}

/** 单条结果命中的来源证据 */
export interface LiteratureSourceEvidence {
  source: string;
  rank: number;
  source_id: string;
  url?: string;
  pdf_url?: string;
}

/** 融合排序后的一条文献 */
export interface LiteratureResult {
  rank: number;
  fused_score: number;
  title: string;
  abstract?: string;
  identifiers: Record<string, string>;
  url?: string;
  pdf_url?: string;
  year?: number;
  authors?: string[];
  venue?: string;
  open_access?: boolean;
  source_evidence: LiteratureSourceEvidence[];
}

/** literature-search-mcp SearchResponse（与 ai-service 透传对齐） */
export interface LiteratureSearchResponse {
  query: string;
  parameters: Record<string, unknown>;
  results: LiteratureResult[];
  source_statuses: LiteratureSourceStatus[];
  total_candidates: number;
  returned: number;
  all_sources_failed: boolean;
}