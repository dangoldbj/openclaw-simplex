export type SimplexExplicitTarget = {
  to: string;
  chatType: "direct" | "group";
};

export type SimplexTargetKind = SimplexExplicitTarget["chatType"] | null;
