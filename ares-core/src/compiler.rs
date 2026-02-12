use crate::{CompiledRule, Profile, Rule};

pub fn compile_profile(profile: &Profile) -> Vec<CompiledRule> {
    profile.rules.iter().map(compile_rule).collect()
}

fn compile_rule(rule: &Rule) -> CompiledRule {
    CompiledRule {
        id: rule.id.clone(),
        action: rule.action.clone(),
        url_filter: rule.pattern.clone(),
        priority: rule.priority,
    }
}
