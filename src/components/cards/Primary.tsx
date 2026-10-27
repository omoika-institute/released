import { ComponentChildren, HTMLAttributes } from "preact";

interface PrimaryCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
  title?: string;
}

export default function PrimaryCard({
  children,
  title,
  ...props
}: PrimaryCardProps) {
  const { className, ...cardProps } = props;

  return (
    <div
      {...cardProps}
      class={`flex w-full flex-col items-center rounded-r-lg border-l-3 bg-linear-to-tr bg-paper-soft shadow-2xl shadow-black/35 backdrop-blur-sm transition-all duration-100 md:w-auto px-16 ${className ?? "border-sea"}`}
    >
      {title && (
        <h2 class="text-ink font-display relative my-4 text-2xl font-medium">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
