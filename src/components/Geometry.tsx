export function Hatch() {
  return (
    <div
      className="absolute inset-0 opacity-45 pointer-events-none"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(217,210,185,0.18) 0px, rgba(217,210,185,0.18) 1px, transparent 1px, transparent 8px)",
      }}
    />
  );
}

export function Grid() {
  return (
    <div
      className="absolute inset-0 opacity-25 pointer-events-none"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}
    />
  );
}

export function DotGrid() {
  return (
    <div
      className="pointer-events-none fixed inset-0 opacity-[0.06]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    />
  );
}
