export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

export type SimplexActionParams = Record<string, unknown>;

export type DeleteMode = "broadcast" | "internal" | "internalMark";
