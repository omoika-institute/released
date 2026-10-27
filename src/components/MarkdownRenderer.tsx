import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";

type MarkdownNode = {
  type: string;
  depth?: number;
  ordered?: boolean;
  value?: string;
  url?: string;
  align?: (string | null)[];
  children?: MarkdownNode[];
};

const remarkParser = remark().use(remarkGfm);

function renderInline(nodes: MarkdownNode[] | undefined, prefix: string) {
  if (!nodes?.length) return null;

  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;

    switch (node.type) {
      case "text":
        return <span key={key}>{node.value ?? ""}</span>;
      case "strong":
        return <strong key={key}>{renderInline(node.children, key)}</strong>;
      case "emphasis":
        return <em key={key}>{renderInline(node.children, key)}</em>;
      case "inlineCode":
        return (
          <code
            key={key}
            className="rounded-sm border border-black/18 bg-black/24 px-1 py-0.5 font-code text-[0.8rem] text-primary-txt"
          >
            {node.value ?? ""}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={node.url ?? "#"}
            onClick={(event) => {
              event.preventDefault();
              if (!node.url) return;
              void window.api.openExternal(node.url);
            }}
            className="underline decoration-sea/40 underline-offset-2 transition-colors hover:text-sea"
          >
            {renderInline(node.children, key)}
          </a>
        );
      case "break":
        return <br key={key} />;
      default:
        if (!node.children?.length) return null;
        return <span key={key}>{renderInline(node.children, key)}</span>;
    }
  });
}

function renderMarkdownNode(
  node: MarkdownNode,
  key: string,
): ComponentChildren {
  switch (node.type) {
    case "heading": {
      const HeadingTag = `h${Math.min(Math.max(node.depth ?? 1, 1), 6)}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      const headingClass =
        node.depth === 1
          ? "mt-1 text-xl font-semibold  text-primary-txt"
          : node.depth === 2
            ? "mt-4 text-lg font-semibold  text-primary-txt"
            : "mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary-txt";
      return (
        <HeadingTag key={key} className={headingClass}>
          {renderInline(node.children, key)}
        </HeadingTag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="mt-2 text-sm leading-6 text-primary-txt">
          {renderInline(node.children, key)}
        </p>
      );
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="mt-3 border-l-2 border-sea/30 pl-4 text-sm leading-6 text-ink-hard/68"
        >
          {node.children?.map((child, index) =>
            renderMarkdownNode(child, `${key}-${index}`),
          )}
        </blockquote>
      );
    case "list": {
      const ListTag = node.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          className={`${node.ordered ? "list-decimal" : "list-disc"} mt-2 ml-5 space-y-1 text-sm leading-6 text-ink-hard/74`}
        >
          {node.children?.map((child, index) =>
            renderMarkdownNode(child, `${key}-${index}`),
          )}
        </ListTag>
      );
    }
    case "listItem":
      return (
        <li key={key}>
          {node.children?.map((child, index) =>
            renderMarkdownNode(child, `${key}-${index}`),
          )}
        </li>
      );
    case "code":
      return (
        <pre
          key={key}
          className="mt-3 overflow-x-auto rounded-sm border border-black/18 bg-panel/25 px-3 py-3 font-code text-[0.85rem] leading-6 text-secondary-txt"
        >
          <code>{node.value ?? ""}</code>
        </pre>
      );
    case "thematicBreak":
      return <hr key={key} className="my-4 border-black/18" />;
    case "table": {
      const [headerRow, ...bodyRows] = node.children ?? [];
      const align = node.align ?? [];
      const cellAlign = (index: number) => {
        const value = align[index];
        return value === "center"
          ? "text-center"
          : value === "right"
            ? "text-right"
            : "text-left";
      };

      return (
        <div key={key} className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm text-secondary-txt">
            <thead>
              <tr>
                {headerRow?.children?.map((cell, index) => (
                  <th
                    key={index}
                    className={`border border-black/18 bg-black/20 px-3 py-1.5 font-semibold ${cellAlign(index)}`}
                  >
                    {renderInline(cell.children, `${key}-h${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="even:bg-black/12">
                  {row.children?.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={`border border-black/18 px-3 py-1.5 ${cellAlign(cellIndex)}`}
                    >
                      {renderInline(
                        cell.children,
                        `${key}-r${rowIndex}c${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      if (!node.children?.length) return null;
      return (
        <div key={key}>
          {node.children.map((child, index) =>
            renderMarkdownNode(child, `${key}-${index}`),
          )}
        </div>
      );
  }
}

export default function MarkdownRenderer({
  markdown,
  className = "",
}: {
  markdown: string;
  className?: string;
}) {
  const tree = useMemo(
    () => remarkParser.parse(markdown) as MarkdownNode,
    [markdown],
  );

  if (!markdown.trim()) return null;

  return (
    <div className={className}>
      {tree.children?.map((node, index) =>
        renderMarkdownNode(node, `md-${index}`),
      )}
    </div>
  );
}
