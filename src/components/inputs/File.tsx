import { type InputHTMLAttributes } from "preact";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/icons";

interface FileInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onBtnClick: () => null;
}

export function AltFile(props: FileInputProps) {
  const { t } = useTranslation();
  const { onBtnClick, ...inputProps } = props;

  return (
    <div className="relative flex w-full">
      <input
        {...inputProps}
        type="text"
        class="hover:border-primary from-mirage-950/30 to-mirage-900/35 outline-mirage-500 hover:outline-mirage-400 focus:outline-primary focus:bg-mirage-400 -mr-0.5 w-full rounded-l border border-r-0 border-slate-900 bg-linear-to-br px-2 py-1 font-sans text-slate-300/90 outline-1 transition-colors duration-75 ease-in-out focus:outline-2"
      />
      <button
        onClick={() => onBtnClick()}
        title={t("shared.fileInput.selectFolder")}
        className="inset-ring-primary-400/95 focus:ring-primary-350 hover:inset-ring-primary-400 border-primary-400/95 focus:border-primary-350 hover:border-primary-400 font-display group flex scale-100 items-center justify-center rounded-xs border-1 px-5 text-left text-sm font-medium tracking-wide whitespace-nowrap text-slate-400 inset-ring-1 transition-all duration-100 ease-linear hover:scale-105 hover:scale-[99%] hover:text-slate-300/70 hover:shadow"
      >
        <Icon
          icon="folder"
          className="absolute top-1.5 left-2.5 h-5 rotate-0 text-slate-400/80 group-hover:rotate-5 group-hover:text-slate-300/70"
        />
      </button>
    </div>
  );
}
