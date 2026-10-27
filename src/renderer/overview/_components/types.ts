import type { Graph } from "@/api";

export type LayoutMode = "grid" | "list";

export type CaseSortMode =
  | "created-desc"
  | "created-asc"
  | "updated-desc"
  | "title-asc"
  | "title-desc";

export type OverviewCase = Graph & {
  description: string;
};
