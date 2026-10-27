import { type InputHTMLAttributes } from "preact";

// TODO: Tidy up into global InputProps as this is inherited for multiple components/inputs/*
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | Element | undefined;
}

export function Checkbox(props: InputProps) {
  const { label, className, ...inputProps } = props;
  return (
    <div
      className={`font-display text-slate-350 relative flex items-center justify-between ${className ?? ""}`}
    >
      <label
        for={label?.toString()}
        class="text-sm select-none text-slate-400 hover:text-slate-350"
      >
        {label}
      </label>
      <input
        {...inputProps}
        type="checkbox"
        id={label?.toString()}
        className="checked:accent-primary-350/95 text-mirage-500 hover:text-mirage-400 checked:bg-primary-350 checked:hover:bg-primary-400 checked:border-primary-350 checked:hover:border-primary-400 peer ms-2 h-4.5 w-4.5 appearance-none rounded border bg-black/40 p-2 text-sm checked:before:relative checked:before:-top-2.5 checked:before:right-[0.3rem] checked:before:text-slate-200 checked:before:content-['\2713\0020']"
      />
    </div>
  );
}
