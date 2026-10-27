import { useState } from "preact/hooks";

interface ToggleSwitchProps {
  label?: string;
  description?: string;
  className?: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
}

export function ToggleSwitch(props: ToggleSwitchProps) {
  const { label, description, className, defaultChecked = false } = props;

  const [isChecked, setIsChecked] = useState(defaultChecked);

  const handleToggle = () => {
    setIsChecked(!isChecked);
  };

  return (
    <div class={`${className ?? ""}`}>
      <label
        htmlFor={props.name}
        class="font-display text-slate-350 text-sm leading-3 font-medium"
      >
        {label ?? ""}
      </label>
      <div class="sm:flex sm:items-start sm:justify-between">
        {description && (
          <div class="text-slate-350 max-w-xl text-sm">
            <p>{description}</p>
          </div>
        )}
        <div class="mt-5 sm:-mt-3 sm:ml-6 sm:flex sm:shrink-0 sm:items-center">
          {/* Hidden checkbox for form submission and accessibility */}
          <input
            type="checkbox"
            checked={isChecked}
            onChange={handleToggle}
            name={props.name}
            id={props.name}
            class="sr-only"
          />

          {/* Visual toggle button */}
          <button
            type="button"
            onClick={handleToggle}
            class={`${
              isChecked ? "bg-primary-400" : "bg-cod-600/50"
            } border-primary hover:ring-primary-400 relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 outline-hidden transition-colors duration-200 ease-in-out hover:ring-1 focus:appearance-none focus:ring-1`}
            role="switch"
            aria-checked={isChecked}
            aria-labelledby={props.name}
          >
            <span class="sr-only">{label}</span>
            <span
              aria-hidden="true"
              class={`${
                isChecked
                  ? "translate-x-7 bg-slate-200"
                  : "translate-x-0 bg-slate-300"
              } mt-0.5 inline-block h-5 w-5 transform rounded-full shadow transition duration-200 ease-in-out`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
