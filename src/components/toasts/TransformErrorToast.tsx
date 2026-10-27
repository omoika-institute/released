import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { Button } from "@/components/buttons/Button";
import { Icon } from "@/components/icons";

type ErrorDetails = {
  source_path?: string;
  transform_path?: string;
  line_number?: number | string;
  transform_label?: string;
};

type TransformErrorPayload = {
  message?: string;
  code?: string;
  details?: ErrorDetails;
};

function normalizeSummary(message: string, details?: ErrorDetails): string {
  if (!details) return message;
  let nextMessage = message.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  const trailingGroup = nextMessage.match(/\s*\(([^()]*)\)\s*$/);
  if (!trailingGroup) return nextMessage;

  const trailingText = trailingGroup[1] || "";
  const sourcePath = details.source_path?.trim();
  const transformPath = details.transform_path?.trim();
  const shouldStrip =
    (sourcePath && trailingText.includes(sourcePath)) ||
    (transformPath && trailingText.includes(transformPath));

  return shouldStrip
    ? nextMessage.slice(0, nextMessage.length - trailingGroup[0].length).trim()
    : nextMessage;
}

function formatLocation(details?: ErrorDetails): string | null {
  const sourcePath = details?.source_path?.trim();
  if (!sourcePath) return null;
  const rawLine = details?.line_number;
  const lineNumber =
    typeof rawLine === "number"
      ? rawLine
      : rawLine != null
        ? Number(rawLine)
        : null;
  return lineNumber && Number.isFinite(lineNumber)
    ? `${sourcePath}:${lineNumber}`
    : sourcePath;
}

function filenameFromPath(filePath?: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

export default function TransformErrorToast({
  error,
}: {
  error: TransformErrorPayload | string;
}) {
  const { t } = useTranslation();
  const payload =
    typeof error === "string"
      ? ({ message: error } as TransformErrorPayload)
      : error;
  const details = payload.details;
  const summary = normalizeSummary(
    payload.message?.trim() || t("shared.transformError.fallback"),
    details
  );
  const sourcePath = details?.source_path?.trim();
  const location = formatLocation(details);
  const fileLabel = filenameFromPath(sourcePath);
  const lineLabel =
    details?.line_number != null && Number.isFinite(Number(details.line_number))
      ? `:${Number(details.line_number)}`
      : "";
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenEditor = async () => {
    if (!sourcePath || isOpening) return;
    setIsOpening(true);
    try {
      const result = await window.api.openInEditor({
        path: sourcePath,
        lineNumber:
          details?.line_number != null
            ? Number(details.line_number)
            : undefined,
      });
      if (!result?.success) {
        toast.error(
          result?.error || t("shared.transformError.openEditorFailed")
        );
      }
    } catch (openError: any) {
      toast.error(
        openError?.message || t("shared.transformError.openEditorFailed")
      );
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="relative isolate w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-ink/10 bg-[linear-gradient(180deg,rgba(8,12,22,0.94),rgba(4,6,12,0.88)_54%,rgba(4,5,10,0.96))] text-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,75,75,0.35),transparent)]" />

      <div className="relative flex gap-3 px-4 py-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[var(--color-danger-hard)]/20 bg-ink/8 text-[var(--color-danger)]">
          <Icon icon="alert-triangle" className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] uppercase tracking-[0.34em] text-ink-soft">
            {t("shared.transformError.title")}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-5 text-ink">
            {summary}
          </p>

          {location ? (
            <div className="mt-3 rounded-sm border border-ink/10 bg-ink/5 px-3 py-2">
              <p className="font-display text-[10px] uppercase tracking-[0.28em] text-ink-soft">
                {t("shared.transformError.source")}
              </p>
              <div className="mt-1.5 flex items-start gap-2">
                <Icon
                  icon="file-code"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-soft"
                />
                <code className="break-all font-mono text-[11px] leading-5 text-ink">
                  {location}
                </code>
              </div>
            </div>
          ) : null}

          {sourcePath ? (
            <div className="mt-3">
              <Button
                onClick={handleOpenEditor}
                disabled={isOpening}
                variant="ghost"
              >
                <Icon icon="external-link" className="h-3.5 w-3.5" />
                {isOpening
                  ? t("shared.transformError.opening")
                  : t("shared.transformError.openInEditor")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
