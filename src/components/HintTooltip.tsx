export function HintTooltip({ children }) {
  return (
    <div class="relative flex h-125 w-125 items-center justify-center">
      <style>
        {`
        @keyframes hint-glow {
          0% { box-shadow: 0 0 30px 5px #48aa48; }
          70% { box-shadow: 0 0 70px 50px rgba(72,170,72,0); }
          100% { box-shadow: 0 0 0 50px rgba(72,170,72,0); }
        }
        @keyframes hint-border {
          0%,100% {
            border-color: rgba(255,255,255,0.6);
            transform: scale(0.95);
          }
          50% {
            border-color: rgba(255,255,255,0.3);
            transform: scale(1);
          }
        }
        `}
      </style>

      <div class="group relative flex h-15 w-15 items-center justify-center">
        {/* rotated square */}
        <span class="absolute z-2 h-2 w-2 bg-white [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />

        {/* glow */}
        <span class="absolute z-1 h-0.5 w-0.5 rounded-full animate-[hint-glow_2s_cubic-bezier(0.25,0.1,0.2,1)_infinite]" />

        {/* border dot */}
        <span class="z-3 h-15 w-15 rounded-full border border-white animate-[hint-border_2s_linear_infinite]" />

        {/* radius */}
        <span class="absolute left-1/2 top-1/2 h-62.5 w-62.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-white/10 opacity-0 transition-all duration-500 ease-[cubic-bezier(0.5,0,0,1)] group-hover:scale-100 group-hover:opacity-100" />

        {/* content */}
        <div class="pointer-events-none absolute bottom-21.25 left-1/2 z-5 ml-14 w-75 opacity-0 transition-opacity duration-700 group-hover:opacity-100">
          <div class="relative py-3 text-white">
            <p class="text-sm leading-6 tracking-wide">{children}</p>
            <span class="absolute bottom-0 left-0 h-px w-0 bg-white transition-all duration-400 group-hover:w-45" />
            <span class="absolute bottom-0 left-0 h-px w-20 origin-left rotate-[-225deg] bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
