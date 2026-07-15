import { AiProvider } from "./providers";

export type RoutingTask =
  | "brief"
  | "draft"
  | "qa"
  | "faq"
  | "meta"
  | "image_brief"
  | "image_gen"
  | "image_check";

export type RegistryModel = {
  id: string;
  provider: AiProvider;
  modelId: string;
  displayName: string;
  capabilities: Array<"text" | "image_gen" | "vision">;
  active: boolean;
};

export type RoutingRule = {
  id: string;
  task: RoutingTask;
  property?: string;
  contentType?: string;
  language?: string;
  modelChain: string[];
  priority: number;
  active: boolean;
};

export type RoutingContext = {
  task: RoutingTask;
  property: string;
  contentType: string;
  language: string;
};

export function resolveModelChain(
  rules: RoutingRule[],
  context: RoutingContext,
  defaultModelId: string,
) {
  const matchingRule = rules
    .filter((rule) => rule.active)
    .filter((rule) => rule.task === context.task)
    .filter((rule) => !rule.property || rule.property === context.property)
    .filter((rule) => !rule.contentType || rule.contentType === context.contentType)
    .filter((rule) => !rule.language || rule.language === context.language)
    .sort((a, b) => b.priority - a.priority)[0];

  return matchingRule?.modelChain.length
    ? matchingRule.modelChain
    : [defaultModelId];
}
