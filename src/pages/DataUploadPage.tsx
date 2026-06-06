import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useUploadApi } from "../hooks/useUploadApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { GlCategory, UploadAnalysis } from "../types/upload";
import { GL_CATEGORY_LABELS, UNIFIED_FIELDS } from "../types/upload";

type Step = "upload" | "briefing" | "review" | "done";

const GL_OPTIONS: GlCategory[] = [
  "materials",
  "subcontractors",
  "billing",
  "payment_lag",
  "overhead",
  "unmapped",
];

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "briefing", label: "AI briefing" },
  { id: "review", label: "Technical review" },
  { id: "done", label: "Merged" },
];

export function DataUploadPage() {
  const { aiAvailable, stats, loading, error, analyzeFile, confirmUpload } = useUploadApi();
  const [analysis, setAnalysis] = useState<UploadAnalysis | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [opco, setOpco] = useState("");
  const [city, setCity] = useState("");
  const [sourceSystem, setSourceSystem] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [confirmed, setConfirmed] = useState<{ rowsAdded: number; totalRows: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setConfirmed(null);
      setStep("upload");
      try {
        const result = await analyzeFile(file, {
          opco,
          city,
          sourceSystem: sourceSystem || undefined,
          useAi: useAi && aiAvailable,
        });
        setAnalysis(result);
        if (result.aiBriefing?.recommendedOpco && !opco) {
          setOpco(result.aiBriefing.recommendedOpco);
        }
        if (result.aiBriefing?.recommendedCity && !city) {
          setCity(result.aiBriefing.recommendedCity);
        }
        if (!sourceSystem && result.detectedSystem !== "Unknown") {
          setSourceSystem(result.detectedSystem);
        }
        setStep(result.aiBriefing ? "briefing" : "review");
      } catch {
        /* error surfaced via useUploadApi */
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [analyzeFile, opco, city, sourceSystem, useAi, aiAvailable],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  }

  function updateMapping(field: keyof UploadAnalysis["columnMapping"], value: string) {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      columnMapping: { ...analysis.columnMapping, [field]: value || null },
    });
  }

  function updateGl(index: number, category: GlCategory) {
    if (!analysis) return;
    const next = [...analysis.glSuggestions];
    next[index] = {
      ...next[index],
      suggestedCategory: category,
      status: category === "unmapped" ? "pending" : "approved",
    };
    setAnalysis({ ...analysis, glSuggestions: next });
  }

  async function handleConfirm() {
    if (!analysis) return;
    const result = await confirmUpload(analysis.uploadId, {
      columnMapping: analysis.columnMapping,
      glSuggestions: analysis.glSuggestions,
      opco: opco || undefined,
      city: city || undefined,
      sourceSystem: sourceSystem || undefined,
    });
    setConfirmed({ rowsAdded: result.rowsAdded, totalRows: result.totalRows });
    setStep("done");
  }

  const activeStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Ingest accounting data</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Drop an Excel or CSV export from Gilde, Yuki, Exact, or Snelstart. Claude analyses the
          file, explains what it contains, and only merges after you confirm.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepIndicator steps={STEPS} activeIndex={activeStepIndex} />
        <Badge
          variant={aiAvailable ? "secondary" : "outline"}
          className="h-7 shrink-0 gap-1.5 px-3"
        >
          {aiAvailable ? (
            <>
              <Sparkles className="h-3 w-3" />
              Anthropic AI ready
            </>
          ) : (
            <>
              <Brain className="h-3 w-3" />
              Heuristic mode
            </>
          )}
        </Badge>
      </div>

      {stats && stats.totalRows > 0 && (
        <Card className="py-0 ring-1 ring-border/60">
          <CardContent className="flex flex-wrap divide-x divide-border-strong p-0">
            <Stat label="Central database rows" value={stats.totalRows.toLocaleString()} />
            <Stat label="Systems" value={String(stats.systems.length)} />
            <Stat label="Opcos" value={String(stats.opcos.length)} />
            <Stat label="Unmapped GL" value={String(stats.unmappedGl)} warn={stats.unmappedGl > 0} />
          </CardContent>
        </Card>
      )}

      {step === "upload" && (
        <div className="grid grid-cols-1 items-start gap-4 pt-1 lg:grid-cols-3 lg:gap-6">
          <Card className="lg:col-span-1 border border-white/[0.08] pb-6 ring-0">
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Context</CardTitle>
              <CardDescription>Optional — AI will suggest opco and city if blank</CardDescription>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="space-y-5">
                <Field
                  label="Operating company"
                  value={opco}
                  onChange={setOpco}
                  placeholder="e.g. Portfolio Company Heeze"
                />
                <Field label="City" value={city} onChange={setCity} placeholder="e.g. Heeze" />
                <Field
                  label="Source system"
                  value={sourceSystem}
                  onChange={setSourceSystem}
                  placeholder="Auto-detected"
                />
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={useAi}
                    disabled={!aiAvailable}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground/90">
                    Use Anthropic AI analysis
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border border-white/[0.08] ring-0">
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Upload file</CardTitle>
              <CardDescription>Excel or CSV export from your accounting system</CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex min-h-[280px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/40 bg-white/[0.02] px-6 py-10 transition-colors",
                  "hover:border-white/50 hover:bg-white/[0.04]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  dragOver && "border-primary/60 bg-primary/[0.06]",
                  loading && "pointer-events-none opacity-80",
                )}
                onClick={() => {
                  if (!loading) openFilePicker();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!loading) openFilePicker();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  className="hidden"
                  onChange={onFileInputChange}
                />
                {loading ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
                    <p className="mt-4 font-medium">Analysing with AI…</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Scanning columns, GL accounts, and date range
                    </p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
                      <Upload className="h-7 w-7 text-muted-foreground" aria-hidden />
                    </div>
                    <p className="font-medium">Drop Excel or CSV here</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      .xlsx, .xls, .csv · max 25MB
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-5 hover:bg-white/[0.06]"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFilePicker();
                      }}
                    >
                      Choose file
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          {error.includes("fetch") && (
            <span className="text-muted-foreground">
              {" "}
              — run <code className="font-mono">npm run dev:api</code>
            </span>
          )}
        </div>
      )}

      {analysis && step === "briefing" && analysis.aiBriefing && (
        <AiBriefingCard
          analysis={analysis}
          briefing={analysis.aiBriefing}
          onContinue={() => setStep("review")}
          onReupload={() => {
            setAnalysis(null);
            setStep("upload");
          }}
        />
      )}

      {analysis && step === "review" && (
        <AnalysisReview
          analysis={analysis}
          opco={opco}
          city={city}
          sourceSystem={sourceSystem}
          onMappingChange={updateMapping}
          onGlChange={updateGl}
          onConfirm={handleConfirm}
          onBack={() => setStep(analysis.aiBriefing ? "briefing" : "upload")}
          loading={loading}
        />
      )}

      {step === "done" && confirmed && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-start gap-3 py-6">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium text-emerald-400">Pushed to central database</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Added {confirmed.rowsAdded} rows — unified dataset now has {confirmed.totalRows}{" "}
                rows. Forecast refreshed.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setAnalysis(null);
                  setConfirmed(null);
                  setStep("upload");
                }}
              >
                Upload another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({
  steps,
  activeIndex,
}: {
  steps: { id: Step; label: string }[];
  activeIndex: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => {
        const isCompleted = i < activeIndex;
        const isActive = i === activeIndex;

        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isActive && "bg-primary text-primary-foreground shadow-sm",
                isCompleted && "bg-primary/15 text-primary",
                !isActive && !isCompleted && "border border-white/15 bg-transparent text-muted-foreground",
              )}
            >
              {isCompleted ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-white/10 text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
              )}
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-white/25" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AiBriefingCard({
  analysis,
  briefing,
  onContinue,
  onReupload,
}: {
  analysis: UploadAnalysis;
  briefing: NonNullable<UploadAnalysis["aiBriefing"]>;
  onContinue: () => void;
  onReupload: () => void;
}) {
  const recColor =
    briefing.mergeRecommendation === "ready"
      ? "text-emerald-400"
      : briefing.mergeRecommendation === "reject"
        ? "text-destructive"
        : "text-amber-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle>AI briefing — read before you merge</CardTitle>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {analysis.filename}
          {analysis.fileType === "xlsx" && analysis.sheetName && (
            <Badge variant="outline">Sheet: {analysis.sheetName}</Badge>
          )}
          <Badge variant="secondary">{analysis.detectedSystem}</Badge>
          <span>{analysis.rowCount.toLocaleString()} rows</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What this data is about
          </p>
          <p className="mt-2 text-sm leading-relaxed">{briefing.summary}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Meta label="Data type" value={briefing.dataType} />
          <Meta
            label="Date range"
            value={
              briefing.dateRange?.start && briefing.dateRange?.end
                ? `${briefing.dateRange.start} → ${briefing.dateRange.end}`
                : "Not detected"
            }
          />
          <Meta
            label="Suggested opco / city"
            value={[briefing.recommendedOpco, briefing.recommendedCity].filter(Boolean).join(" · ") || "—"}
          />
        </div>

        {briefing.qualityChecks.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quality checks
            </p>
            <ul className="mt-2 space-y-1.5">
              {briefing.qualityChecks.map((c) => (
                <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="text-primary">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            {analysis.warnings.map((w) => (
              <p key={w} className="text-sm text-amber-400">
                ⚠ {w}
              </p>
            ))}
          </div>
        )}

        <Separator />

        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Confirm before merge
          </p>
          <p className="mt-2 text-sm font-medium">{briefing.controllerQuestion}</p>
          <p className={`mt-2 text-xs ${recColor}`}>
            Recommendation: {briefing.mergeRecommendation.replace("_", " ")}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button onClick={onContinue} disabled={briefing.mergeRecommendation === "reject"}>
          I understand — review mappings
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onReupload}>
          Upload different file
        </Button>
      </CardFooter>
    </Card>
  );
}

function AnalysisReview({
  analysis,
  opco,
  city,
  sourceSystem,
  onMappingChange,
  onGlChange,
  onConfirm,
  onBack,
  loading,
}: {
  analysis: UploadAnalysis;
  opco: string;
  city: string;
  sourceSystem: string;
  onMappingChange: (field: keyof UploadAnalysis["columnMapping"], value: string) => void;
  onGlChange: (index: number, category: GlCategory) => void;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const unmappedPending = analysis.glSuggestions.filter(
    (s) => s.suggestedCategory === "unmapped" && s.status !== "rejected",
  );

  return (
    <div className="flex flex-col gap-5">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-base">Technical review</CardTitle>
          <CardDescription>
            Verify column and GL mappings, then push to the central database.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{analysis.detectedSystem}</Badge>
          <span>{analysis.rowCount} rows</span>
          {opco && <span>Opco: {opco}</span>}
          {city && <span>City: {city}</span>}
          {sourceSystem && <span>System: {sourceSystem}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Column mapping</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-4">Unified field</th>
                <th className="pb-2">Source column</th>
                <th className="pb-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {UNIFIED_FIELDS.map(({ key, label, required }) => (
                <tr key={key} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    {label}
                    {required && <span className="text-destructive"> *</span>}
                  </td>
                  <td className="py-2">
                    <select
                      value={analysis.columnMapping[key] ?? ""}
                      onChange={(e) => onMappingChange(key, e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    >
                      <option value="">— not mapped —</option>
                      {analysis.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {analysis.columnConfidence[key]
                      ? `${Math.round(analysis.columnConfidence[key] * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {analysis.glSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GL account mapping</CardTitle>
            <CardDescription>Assign categories before merging unmapped accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.glSuggestions.map((s, i) => (
              <div
                key={s.glAccount}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <span className="font-mono text-sm">{s.glAccount}</span>
                <select
                  value={s.suggestedCategory}
                  onChange={(e) => onGlChange(i, e.target.value as GlCategory)}
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                >
                  {GL_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {GL_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">{s.reason}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {analysis.sampleNormalized.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview — unified rows</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {["date", "gl_account", "amount", "opco", "source_system", "gl_category"].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.sampleNormalized.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 font-mono">
                    {["date", "gl_account", "amount", "opco", "source_system"].map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        {String(row[k] ?? "")}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-primary">auto</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          disabled={loading || unmappedPending.length > 0}
          onClick={onConfirm}
          className="gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Pushing…
            </>
          ) : (
            <>
              <Database className="h-4 w-4" />
              Push to central database
            </>
          )}
        </Button>
        {unmappedPending.length > 0 && (
          <p className="text-sm text-amber-400">
            Assign categories to {unmappedPending.length} unmapped GL account(s) first.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground/90">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-white/[0.12] bg-background px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      />
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-[140px] flex-1 px-6 py-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          warn ? "text-amber-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
