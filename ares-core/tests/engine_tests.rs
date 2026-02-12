use ares_core::{evaluate, Action, Profile, Request, ResourceType, Rule};

#[test]
fn disabled_profile_allows() {
    let p = Profile {
        id: "p1".into(),
        name: "Work".into(),
        enabled: false,
        rules: vec![],
    };

    let req = Request {
        url: "https://ads.example.com".into(),
        initiator: None,
        resource_type: ResourceType::Script,
    };

    let d = evaluate(&req, &p);
    assert_eq!(d.action, Action::Allow);
    assert_eq!(d.trace.matched_rule_id, None);

}

#[test]
fn matches_highest_priority_rule() {
    let p = Profile {
        id: "p1".into(),
        name: "Work".into(),
        enabled: true,
        rules: vec![
            Rule {
                id: "low".into(),
                description: "block ads".into(),
                action: Action::Block,
                pattern: "ads".into(),
                priority: 10,
            },
            Rule {
                id: "high".into(),
                description: "allow example".into(),
                action: Action::Allow,
                pattern: "example.com".into(),
                priority: 100,
            },
        ],
    };

    let req = Request {
        url: "https://ads.example.com/script.js".into(),
        initiator: None,
        resource_type: ResourceType::Script,
    };

    let d = evaluate(&req, &p);
    assert_eq!(d.action, Action::Allow);
    assert_eq!(d.trace.matched_rule_id.as_deref(), Some("high"));
}
