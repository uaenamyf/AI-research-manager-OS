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
  createdTime: string;
}

export interface PaperListItem {
  id: ID;
  title: string;
  authors: string;
  year: number;
  status: PaperStatus;
  folderId: ID | null;
  createdTime: string;
}

/** F4 Paper Intelligence Card 结构 */
export interface PaperIntelligenceCard {
  title?: string;
  authors?: string;
  year?: number;
  journal?: string;
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

// ===== F5 Paper Chat =====
export interface ChatMessage {
  id: ID;
  userId: ID;
  paperId: ID;
  question: string;
  answer: string;
  createdTime: string;
  /** RAG 引用的 chunk_id 列表 */
  citations?: ID[];
}

export interface ChatRequest {
  paperId: ID;
  question: string;
}

/** SSE 流式事件 */
export interface ChatStreamEvent {
  type: "token" | "citation" | "done" | "error";
  content: string;
  citations?: ID[];
}

// ===== F6 Knowledge Base =====
export interface KnowledgeTag {
  id: ID;
  name: string;
  count: number;
}

export interface KnowledgeSearchResult {
  paperId: ID;
  title: string;
  authors: string;
  snippet: string;
  tags: string[];
  score: number;
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