import type { JSX, ComponentChildren } from "preact";

export type ButtonStyle =
  | "primary"
  | "danger"
  | "accent"
  | "secondary"
  | "emerald";
export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
  variant: ButtonStyle;
}

export type ButtonIconStyle = "toolbar";
export interface IconButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ComponentChildren;
  variant: ButtonIconStyle;
}

const icon = {
  toolbar:
    "bg-mirage-950 hover:border-primary-350 hover:text-slate-350 border-slate-900 hover:bg-slate-900 focus:bg-slate-900/60",
};

export function Icon(props: IconButtonProps): JSX.Element {
  const { children, className, variant, ...btnProps } = props;

  return (
    <button
      {...btnProps}
      class={`group rounded-sm border p-1 text-xs ${icon[variant]} ${className ?? ""} `}
    >
      {children}
    </button>
  );
}

const solid = {
  accent:
    "hover:ring-emerald-600 ring-primary-600 bg-emerald-600/10 hover:bg-emerald-600 focus:bg-emerald-600 focus:outline-emerald-600 disabled:bg-slate-800 disable:border-slate-800 disabled:stroke-slate-800 disable:outline-slate-800 disabled:ring-slate-800 disabled:text-slate-600/80 focus:outline-emerald-600 outline-1 outline-emerald-600 focus:outline-2 disabled:outline-slate-800 disabled:hover:scale-100 shadow-md shadow-emerald-900/30 hover:shadow-emerald-950 hover:shadow-2xs ",
  primary:
    "hover:ring-primary-400 ring-primary-350 bg-primary-350 hover:bg-primary-400 focus:bg-primary-400 focus:outline-primary-300 disabled:bg-slate-800 disable:border-slate-800 disabled:stroke-slate-800 disable:outline-slate-800 disabled:ring-slate-800 disabled:text-slate-400/80 focus:outline-primary-200 outline-1 outline-primary-350 focus:outline-2 disabled:outline-slate-800 disabled:hover:scale-100 shadow-md shadow-primary-900/30 hover:shadow-primary-950 hover:shadow-2xs ",
  danger:
    "ring-danger-500/90 hover:ring-danger-700 bg-danger-600/90 hover:bg-danger-700 focus:bg-danger-600/90 hover:stroke-danger-700 stroke-danger-600/90 disabled:ring-slate-800 disabled:bg-slate-800 disabled:border-slate-800 disabled:text-slate-400/80 hover:disabled:scale-100!",
};

export function Solid(props: ButtonProps): JSX.Element {
  const { children, className, variant, ...btnProps } = props;

  return (
    <button
      {...btnProps}
      class={`group font-display flex scale-100 items-center justify-center rounded px-4 py-1.5 text-left text-sm font-semibold tracking-wide whitespace-nowrap text-slate-200/99 ring-1 transition-all duration-75 ease-in hover:scale-[99%] hover:text-slate-200 hover:ring-inset ${solid[variant]} ${className ?? ""} `}
    >
      {children}
    </button>
  );
}

const ghost = {
  accent:
    "shadow-emerald-900/5 bg-emerald/5  hover:bg-emerald/7 ring-emerald-600 outline-emerald-600 border-emerald-600 hover:ring-emerald-600 hover:shadow-emerald-900/10 hover:border-emerald-600 hover:shadow-2xs focus:ring-emerald-600 focus:bg-emerald/6 active:bg-emerald/5 focus:border-emerald-600 focus:outline-0 focus:backdrop-brightness-85 active:backdrop-brightness-85 active:ring-primary-300 active:outline-emerald-300 active:border-emerald-300 disabled:ring-emerald-600 disabled:border-emerald-600 disabled:text-emerald-500 shadow-lg",
  primary:
    "shadow-primary-900/50 bg-primary/1 backdrop-brightness-100 hover:backdrop-brightness-90 hover:bg-primary/7 ring-primary-350 outline-primary-350 border-primary-350 hover:ring-primary-400 hover:shadow-primary-900 hover:border-primary-400 hover:shadow-2xs focus:ring-primary-350 focus:bg-primary/6 active:bg-primary/5 focus:border-primary-350 focus:outline-0 focus:backdrop-brightness-85 active:backdrop-brightness-85 active:ring-primary-300 active:outline-primary-300 active:border-primary-300 disabled:ring-slate-600 disabled:border-slate-600 disabled:text-slate-500 shadow-lg",
  danger:
    "ring-danger-500/90 focus:ring-danger-500/85 bg-transparent hover:ring-danger-500 border-danger-500/90 focus:border-danger-500 hover:border-danger-500  ",
};

export function Ghost(props: ButtonProps): JSX.Element {
  const { children, className, variant, ...btnProps } = props;

  return (
    <button
      {...btnProps}
      class={`group font-display flex scale-100 items-center justify-center rounded border px-4 py-1.5 text-left text-sm ring-inset ring-1 font-semibold tracking-wide whitespace-nowrap text-slate-300/99  disabled:border-slate-600 disabled:text-slate-600! disabled:ring-1 disabled:ring-inset disabled:ring-slate-600 transition-all duration-75 ease-in hover:scale-[99%] disabled:scale-none! hover:text-slate-300 hover:ring-inset hover:ring-1 ${ghost[variant]} ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

const Button = {
  Ghost,
  Solid,
  Icon,
};

export default Button;
