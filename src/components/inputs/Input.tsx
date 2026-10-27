import { type InputHTMLAttributes } from "preact";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | Element | undefined;
}

type ComboOption = string | { label: string; value: string };

export function Input(props: InputProps) {
  const { className, label, ...inputProps } = props;
  return (
    <div className="relative mt-7 flex w-full flex-col">
      {label && (
        <label class="text-primary-txt font-display absolute -top-6 -left-1 rounded-t px-2 text-xs font-medium">
          {label}
        </label>
      )}
      <input
        {...inputProps}
        className={`hover:outline-muted-txt outline-subtle focus-visible:border-subtle text-primary-txt w-64 rounded border border-transparent bg-transparent bg-linear-to-br bg-canvas px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-muted-txt hover:bg-canvas focus:bg-panel/25 focus-visible:outline-transparent ${className ?? ""}`}
      />
    </div>
  );
}
