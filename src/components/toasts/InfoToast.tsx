type InfoToastProps = {
  message: string;
};

export default function InfoToast({ message }: InfoToastProps) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-review-border shadow-[0_0_12px_rgba(217,170,66,0.45)]" />
      <div className="min-w-0">
        <span className="block font-mono text-[8px] uppercase tracking-[0.42em] text-review-border/75">
          Notice
        </span>
        <span className="mt-1 block font-display text-[13px] leading-snug tracking-[0.04em] text-secondary-txt">
          {message}
        </span>
      </div>
    </div>
  );
}
