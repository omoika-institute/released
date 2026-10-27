import { useEffect, useRef, useState } from "preact/hooks";

interface RotationControlProps {
  rotation: number;
  onRotationChange: (angle: number) => void;
  size?: number;
}

export default function RotationControl({
  rotation,
  onRotationChange,
  size = 40,
}: RotationControlProps) {
  const [isDragging, setIsDragging] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);

  // Convert angle to thumb position on circle
  const angleToPosition = (angle: number) => {
    const rad = (angle - 90) * (Math.PI / 180); // -90 to start at top
    const radius = size / 2 - 4;
    return {
      x: size / 2 + radius * Math.cos(rad),
      y: size / 2 + radius * Math.sin(rad),
    };
  };

  const calculateAngle = (clientX: number, clientY: number) => {
    if (!controlRef.current) return rotation;

    const rect = controlRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;

    let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    angle += 90; // Adjust so 0° is at top
    if (angle < 0) angle += 360;
    if (angle >= 360) angle -= 360;

    return Math.round(angle);
  };

  const handlePointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    const newAngle = calculateAngle(e.clientX, e.clientY);
    onRotationChange(newAngle);

    if (e.currentTarget && (e.currentTarget as HTMLElement).setPointerCapture) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDragging) return;
    const newAngle = calculateAngle(e.clientX, e.clientY);
    onRotationChange(newAngle);
    e.preventDefault();
  };

  const handlePointerUp = (e: PointerEvent) => {
    setIsDragging(false);
    if (
      e.currentTarget &&
      (e.currentTarget as HTMLElement).releasePointerCapture
    ) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    e.preventDefault();
  };

  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;

    control.addEventListener("pointerdown", handlePointerDown as any);
    control.addEventListener("pointermove", handlePointerMove as any);
    control.addEventListener("pointerup", handlePointerUp as any);
    control.addEventListener("pointercancel", handlePointerUp as any);

    return () => {
      control.removeEventListener("pointerdown", handlePointerDown as any);
      control.removeEventListener("pointermove", handlePointerMove as any);
      control.removeEventListener("pointerup", handlePointerUp as any);
      control.removeEventListener("pointercancel", handlePointerUp as any);
    };
  }, [isDragging, rotation]);

  const thumbPos = angleToPosition(rotation);

  return (
    <div
      ref={controlRef}
      className="relative cursor-pointer select-none p-4"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        touchAction: "none",
      }}
      title={`Rotation: ${rotation}°`}
    >
      {/* Outer circle */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0 hover:stroke-slate-700 stroke-slate-800"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 2}
          fill="#020617"
          strokeWidth="2"
        />

        {/* Center dot */}
        <circle cx={size / 2} cy={size / 2} r={1} fill="#1e293b" />

        {/* Thumb */}
        <circle
          cx={thumbPos.x}
          cy={thumbPos.y}
          r={5}
          fill="#1628ff"
          stroke="#2b3bff"
          strokeWidth="1"
          className={isDragging ? "opacity-100" : "opacity-80"}
        />

        {/* Line from center to thumb */}
        <line
          x1={size / 2}
          y1={size / 2}
          x2={thumbPos.x}
          y2={thumbPos.y}
          stroke="#1e293b"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
