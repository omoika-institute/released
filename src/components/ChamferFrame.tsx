interface ChamferFrameProps {
  sizeClass?: string;
  colorClass?: string;
}

export function ChamferFrame({
  sizeClass = "h-2 w-2",
  colorClass = "bg-backdrop-500",
}: ChamferFrameProps) {
  return (
    <>
      <span class={`absolute left-0 top-0 ${sizeClass} ${colorClass} [clip-path:polygon(0_0,100%_0,0_100%)]`} />
      <span class={`absolute right-0 top-0 ${sizeClass} ${colorClass} [clip-path:polygon(0_0,100%_0,100%_100%)]`} />
      <span class={`absolute bottom-0 left-0 ${sizeClass} ${colorClass} [clip-path:polygon(0_0,0_100%,100%_100%)]`} />
      <span class={`absolute bottom-0 right-0 ${sizeClass} ${colorClass} [clip-path:polygon(100%_0,0_100%,100%_100%)]`} />
    </>
  );
}
