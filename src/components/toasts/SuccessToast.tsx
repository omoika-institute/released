type SuccessToastProps = {
  message: string;
};

export default function SuccessToast({ message }: SuccessToastProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[8px] uppercase tracking-[0.42em] text-signal/70">
        Confirmed
      </span>
      <span className="font-mono text-[11px] leading-snug tracking-[0.06em] text-ink-hard">
        {message}
      </span>
    </div>
  );
}
