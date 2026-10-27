export type UserToolParamType = "string" | "number" | "integer" | "boolean";

export interface UserToolParameterDef {
  type: UserToolParamType;
  description?: string;
}

export interface UserToolParameters {
  properties: Record<string, UserToolParameterDef>;
  required?: string[];
}

export interface UserToolDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters: UserToolParameters;
  script: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserToolSavePayload {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters: UserToolParameters;
  script: string;
}

export interface BuiltinToolInfo {
  name: string;
  description: string;
  enabled: boolean;
}
