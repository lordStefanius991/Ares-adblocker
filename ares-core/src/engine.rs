use crate::{Action, ExplainTrace, Profile, Request};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decision {
    pub action: Action,
    pub trace: ExplainTrace,
}

pub fn evaluate(req: &Request, profile: &Profile) -> Decision {
    if !profile.enabled {
        return Decision {
            action: Action::Allow,
            trace: ExplainTrace {
                profile_id: profile.id.clone(),
                evaluated_rules: vec![],
                matched_rule_id: None,
                decision: Action::Allow,
            },
        };
    }

    let mut rules = profile.rules.clone();
    rules.sort_by(|a, b| b.priority.cmp(&a.priority));

    let mut evaluations = Vec::new();

    for r in rules {
        let matched = req.url.contains(&r.pattern);

        evaluations.push(crate::explain::RuleEvaluation {
            rule_id: r.id.clone(),
            matched,
        });

        if matched {
            return Decision {
                action: r.action.clone(),
                trace: ExplainTrace {
                    profile_id: profile.id.clone(),
                    evaluated_rules: evaluations,
                    matched_rule_id: Some(r.id),
                    decision: r.action,
                },
            };
        }
    }

    Decision {
        action: Action::Allow,
        trace: ExplainTrace {
            profile_id: profile.id.clone(),
            evaluated_rules: evaluations,
            matched_rule_id: None,
            decision: Action::Allow,
        },
    }
}
