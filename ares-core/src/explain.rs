use crate::Action;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleEvaluation {
    pub rule_id: String,
    pub matched: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExplainTrace {
    pub profile_id: String,
    pub evaluated_rules: Vec<RuleEvaluation>,
    pub matched_rule_id: Option<String>,
    pub decision: Action,
}
