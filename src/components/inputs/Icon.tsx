import {
  type JSX,
  type MouseEventHandler,
  type InputHTMLAttributes,
} from "preact";

interface IconInputProps extends InputProps {
  icon: JSX.Element;
  onBtnClick?: MouseEventHandler<HTMLButtonElement>;
}

// TODO: Tidy up into proper types for all types that inherit this
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | Element | undefined;
}

export function AltIcon(props: IconInputProps) {
  const { className, label, icon, onBtnClick, ...inputProps } = props;

  return (
    <div className="relative flex w-full flex-col">
      {label && (
        <label class="text-slate-350 font-display absolute -top-6 -left-1 mt-7 rounded-t px-2 text-sm font-medium">
          {label}
        </label>
      )}
      <div className="group relative flex w-full">
        <input
          {...inputProps}
          className={`hover:outline-white/10 outline-white/5 focus-visible:border-primary text-slate-350 w-64 rounded border-2 border-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-800 hover:from-black/35 hover:to-black/20 focus:border-2 focus:bg-black/60 focus-visible:outline-transparent ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={onBtnClick}
          className="focus:text-primary hover:text-primary-350 focus:outline-primary-400 absolute top-1 right-0 h-6 w-6 rounded p-0.5 text-slate-800 focus:outline-hidden"
        >
          {icon}
        </button>
      </div>
    </div>
  );
}
