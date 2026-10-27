import { useEffect, useRef, useCallback } from "preact/hooks";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

interface TerminalProps {
  className?: string;
  onClear?: () => void;
}

const TERMINAL_THEME = {
  background: "transparent",
  foreground: "#e2e8f0",
  cursor: "#94a3b8",
  cursorAccent: "#0f172a",
  selectionBackground: "rgba(59, 130, 246, 0.25)",
  black: "#0f172a",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e2e8f0",
  brightBlack: "#64748b",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
};

export default function Terminal({ className, onClear }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);

  const writeLine = useCallback((text: string) => {
    if (terminalRef.current) {
      terminalRef.current.writeln(text);
    }
  }, []);

  const write = useCallback((text: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(text);
    }
  }, []);

  const clear = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
      onClear?.();
    }
  }, [onClear]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new XTerm({
      theme: TERMINAL_THEME,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: false,
      cursorStyle: "underline",
      disableStdin: true,
      convertEol: true,
      scrollback: 1000,
      allowTransparency: true,
    });

    terminal.open(containerRef.current);
    terminalRef.current = terminal;

    // Initial welcome message
    terminal.writeln("\x1b[90mNo transform logs found...\x1b[0m");

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && terminalRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        const cols = Math.floor(width / 7.2); // approximate char width
        const rows = Math.floor(height / 17); // approximate line height
        if (cols > 0 && rows > 0) {
          terminalRef.current.resize(cols, rows);
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  // Expose methods via ref-like pattern
  useEffect(() => {
    (window as any).__terminalWriteLine = writeLine;
    (window as any).__terminalWrite = write;
    (window as any).__terminalClear = clear;

    return () => {
      delete (window as any).__terminalWriteLine;
      delete (window as any).__terminalWrite;
      delete (window as any).__terminalClear;
    };
  }, [writeLine, write, clear]);

  return (
    <div
      ref={containerRef}
      className={`terminal-shell overflow-hidden rounded-md border border-slate-800/40 bg-linear-to-br from-black/35 to-black/25 ${className ?? ""}`}
      style={{ minHeight: "120px" }}
    />
  );
}

// Export utility functions for external use
export function useTerminal() {
  const writeLine = useCallback((text: string) => {
    (window as any).__terminalWriteLine?.(text);
  }, []);

  const write = useCallback((text: string) => {
    (window as any).__terminalWrite?.(text);
  }, []);

  const clear = useCallback(() => {
    (window as any).__terminalClear?.();
  }, []);

  return { writeLine, write, clear };
}
