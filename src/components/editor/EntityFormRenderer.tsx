import { Fragment, type JSX } from "preact/compat";

export type EntityFormRendererProps<TElement> = {
  elements: Array<TElement | TElement[]>;
  renderElement: (element: TElement, meta: RenderMeta) => JSX.Element;
  className?: string;
  rowClassName?: string;
  onSubmit?: (event: Event) => void;
};

export type RenderMeta = {
  key: string;
  rowIndex: number;
  colIndex: number;
};

export default function EntityFormRenderer<TElement extends { width?: number; id?: string }>({
  elements,
  renderElement,
  className,
  rowClassName,
  onSubmit,
}: EntityFormRendererProps<TElement>) {
  return (
    <form
      className={className ?? "elements"}
      style={{ gridTemplateColumns: "100%" }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(event);
      }}
    >
      {elements.map((entry, rowIndex) => {
        const row = normalizeRow(entry);
        if (!row.length) return null;
        if (row.length === 1) {
          const element = row[0];
          const key = element?.id ?? `${rowIndex}-0`;
          return (
            <Fragment key={key}>
              {renderElement(element, { key, rowIndex, colIndex: 0 })}
            </Fragment>
          );
        }
        return (
          <div
            key={`row-${rowIndex}`}
            className={rowClassName}
            style={{
              display: "grid",
              columnGap: "0.5rem",
              gridTemplateColumns: row
                .map((column) => `${column.width ?? 1}fr`)
                .join(" "),
            }}
          >
            {row.map((element, colIndex) => {
              const key = element?.id ?? `${rowIndex}-${colIndex}`;
              return (
                <Fragment key={key}>
                  {renderElement(element, { key, rowIndex, colIndex })}
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </form>
  );
}

function normalizeRow<TElement>(entry: TElement | TElement[]): TElement[] {
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}
