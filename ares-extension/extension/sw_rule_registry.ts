import { KEY_RULE_REGISTRY, RuleMeta } from "./sw_types";

function ruleKey(id: number) {
  return String(id);
}

export async function getRuleRegistry(): Promise<Record<string, RuleMeta>> {
  const data = await chrome.storage.local.get(KEY_RULE_REGISTRY);
  return (data[KEY_RULE_REGISTRY] ?? {}) as Record<string, RuleMeta>;
}

export async function setRuleRegistry(reg: Record<string, RuleMeta>) {
  await chrome.storage.local.set({ [KEY_RULE_REGISTRY]: reg });
}

export async function mergeRuleRegistry(
  partial: Record<string, RuleMeta>,
  removeIds: number[]
) {
  const existing = await getRuleRegistry();

  for (const id of removeIds) delete existing[ruleKey(id)];
  for (const k of Object.keys(partial)) existing[k] = partial[k];

  await setRuleRegistry(existing);
}

export async function clearRuleRegistry() {
  await setRuleRegistry({});
}

export { ruleKey };
