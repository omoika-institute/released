import { type JSX } from "preact";

interface ItemHintProps {
  hint?: string | JSX.Element;
}

export default function HintTip({ hint }: ItemHintProps) {
  return (
    <div className="text-slate-300 leading-6">
      <div className="">
        <div className="h-62.5 w-62.5">
          <div className="hint group relative mx-auto mt-37.5 flex h-15 w-15 items-center justify-center">
            <span className="absolute left-1/2 top-1/2 h-62.5 w-62.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700/10 opacity-0 invisible scale-0 transition-[background-color,opacity,visibility,transform] duration-500 ease-[cubic-bezier(0.5,0,0,1)] group-hover:opacity-100 group-hover:visible group-hover:scale-100" />
            {/* dot / border pulse */}
            <span className="z-3 block h-15 w-15 rounded-full border border-slate-300/60 animate-[hintBorder_2s_linear_infinite]" />
            <div className="pointer-events-none absolute z-5 w-75 py-3 text-slate-300 left-1/2 bottom-21.25 ml-14 opacity-0 invisible transition-[opacity,visibility] duration-700 ease-out group-hover:opacity-100 group-hover:visible">
              {hint && (
                <div className="relative">
                  <p className="text-sm leading-6 max-w-72">{hint}</p>
                  {/* underline grows on hover */}
                  <span className="absolute bottom-0 left-0 h-px w-0 bg-slate-300 transition-[width] duration-400 group-hover:w-48" />
                  {/* angled leader */}
                  <span className="absolute bottom-0 left-0 h-px w-20 origin-left -rotate-225 bg-slate-300 opacity-100 transition-opacity duration-500" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
