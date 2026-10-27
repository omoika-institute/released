import { type InputHTMLAttributes } from "preact";
import { useState } from "preact/hooks";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Password(props: PasswordInputProps) {
  const { t } = useTranslation();
  const { type: _, className, label, ...inputProps } = props;
  const [hidePassword, setHidePassword] = useState<"text" | "password">(
    "password"
  );
  const toggleShowPassword = () =>
    setHidePassword(hidePassword === "password" ? "text" : "password");

  return (
    <div className="relative mt-6 flex w-full flex-col">
      {label && (
        <label
          for={label}
          class="text-slate-350 font-display absolute -top-6 -left-1 rounded-t px-2 text-sm"
        >
          {label}
        </label>
      )}
      <div className="relative flex w-full">
        <input
          {...inputProps}
          type={hidePassword}
          className={`hover:outline-mirage-400 outline-mirage-500 focus-visible:border-primary text-slate-350 w-64 rounded border-2 border-transparent bg-linear-to-br from-black/35 to-black/10 px-2 py-1 font-sans outline-1 transition-all duration-100 ease-in placeholder:text-slate-700 hover:from-black/35 hover:to-black/20 focus:border-2 focus:bg-black/60 focus-visible:outline-transparent ${className ?? ""}`}
        />
        <button
          type="button"
          onClick={toggleShowPassword}
          className="absolute top-0.5 right-1 rounded p-1 text-slate-800 outline-hidden focus:text-slate-600 focus:outline-hidden"
        >
          <Icon
            icon={hidePassword === "password" ? "eye-off" : "eye"}
            title={
              hidePassword === "password"
                ? t("shared.password.show")
                : t("shared.password.hide")
            }
            className={`${hidePassword !== "password" && "text-primary-350!"} relative -top-0.5 right-0 h-6 w-6 scale-100 rotate-0 hover:scale-110 hover:rotate-5`}
          />
        </button>
      </div>
    </div>
  );
}
