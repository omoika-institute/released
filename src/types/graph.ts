export type NodeInputType =
  | "dropdown"
  | "text"
  | "upload"
  | "title"
  | "section"
  | "textarea"
  | "md"
  | "markdown"
  | "copy-text"
  | "empty"
  | "url";

export interface NodeInputProps {
  type: NodeInputType;
  label: string;
  value?: string;
  icon?: string;
  options?: Array<string | { label: string; value: string; tooltip?: string }>;
  accept?: string;
  width?: number;
  id?: string;
}

export interface NodeElementProps {
  id: string;
  label: string;
  icon?: string;
  value?: string;
  data?: Record<string, any>;
}
