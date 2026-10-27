import { type TextareaHTMLAttributes } from "preact";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea(props: TextareaProps) {
  const { className, label, ...inputProps } = props;
  return (
    <div className="relative mt-7 flex w-full flex-col">
      {label && (
        <label
          for={label}
          class="text-slate-350/90 font-display absolute -top-6 -left-1 rounded-t px-2 text-sm font-medium"
        >
          {label}
        </label>
      )}

      <textarea
        {...inputProps}
        className={`hover:outline-mirage-400 outline-mirage-500 focus:outline-primary focus:ring-primary focus:border-primary text-slate-350 w-64 rounded border border-transparent bg-linear-to-br from-black/35 to-black/10 p-2 py-1 font-sans outline-1 transition-colors duration-100 ease-in-out placeholder:text-slate-700 hover:from-black/35 hover:to-black/30 focus:bg-black/60 ${className ?? ""}`}
      />
    </div>
  );
}
