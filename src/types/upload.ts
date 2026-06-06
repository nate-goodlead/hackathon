export type UploadStatus = "pending" | "confirmed";

export type MergeRecommendation = "ready" | "review_required" | "reject";

export interface AiBriefing {
  summary: string;
  dataType: string;
  recommendedOpco: string | null;
  recommendedCity: string | null;
  dateRange?: { start: string | null; end: string | null };
  qualityChecks: string[];
  mergeRecommendation: MergeRecommendation;
  controllerQuestion: string;
}

export type GlCategory =
  | "materials"
  | "subcontractors"
  | "billing"
  | "payment_lag"
  | "overhead"
  | "unmapped";

export interface ColumnMappingDto {
  date: string | null;
  gl_account: string | null;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  description: string | null;
  opco: string | null;
  project_id: string | null;
  source_system: string | null;
  city: string | null;
}

export interface GlSuggestionDto {
  glAccount: string;
  suggestedCategory: GlCategory;
  confidence: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

export interface UploadAnalysis {
  uploadId: string;
  filename: string;
  rowCount: number;
  headers: string[];
  sampleRows: Record<string, string>[];
  detectedSystem: string;
  systemConfidence: number;
  columnMapping: ColumnMappingDto;
  columnConfidence: Record<string, number>;
  glSuggestions: GlSuggestionDto[];
  sampleNormalized: Record<string, string | number>[];
  warnings: string[];
  aiUsed: boolean;
  aiNotes?: string;
  aiBriefing?: AiBriefing;
  fileType?: "csv" | "xlsx";
  sheetName?: string | null;
  status?: UploadStatus;
  rowsAdded?: number;
  totalRows?: number;
}

export interface UnifiedStats {
  totalRows: number;
  opcos: string[];
  systems: string[];
  cities: string[];
  unmappedGl: number;
}

export const GL_CATEGORY_LABELS: Record<GlCategory, string> = {
  materials: "Materials outflows",
  subcontractors: "Subcontractor payments",
  billing: "Milestone billing",
  payment_lag: "Payment lag",
  overhead: "Overhead",
  unmapped: "Unmapped — needs review",
};

export const UNIFIED_FIELDS: { key: keyof ColumnMappingDto; label: string; required?: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "gl_account", label: "GL account" },
  { key: "amount", label: "Amount" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "description", label: "Description" },
  { key: "opco", label: "Operating company" },
  { key: "project_id", label: "Project ID" },
  { key: "city", label: "City / location" },
];
