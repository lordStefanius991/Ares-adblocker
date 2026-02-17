use ares_core::*;

#[test]
fn evaluate_json_roundtrip() {
    let input = EvaluateInput {
        profile: Profile {
            id: "p1".into(),
            name: "Work".into(),
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                description: "block ads".into(),
                action: Action::Block,
                pattern: "ads".into(),
                priority: 1,
            }],
        },
        request: Request {
            url: "https://ads.example.com/a.js".into(),
            initiator: None,
            resource_type: ResourceType::Script,
        },
    };

    let json_in = serde_json::to_string(&input).unwrap();
    let json_out = evaluate_json(&json_in).unwrap();

    // Deve essere JSON valido e contenere una decisione
    let parsed: EvaluateOutput = serde_json::from_str(&json_out).unwrap();
    assert_eq!(parsed.decision.action, Action::Block);
    assert_eq!(parsed.decision.trace.matched_rule_id.as_deref(), Some("r1"));
}

#[test]
fn evaluate_json_rejects_invalid_json() {
    let bad = "{ not json }";
    let err = evaluate_json(bad).unwrap_err();
    assert!(!err.message.is_empty());
}
