use ares_core::*;

#[test]
fn simulate_json_batch() {
    let input = SimulateInput {
        profile: Profile {
            id: "p1".into(),
            name: "Test".into(),
            enabled: true,
            rules: vec![Rule {
                id: "r1".into(),
                description: "block ads".into(),
                action: Action::Block,
                pattern: "ads".into(),
                priority: 1,
            }],
        },
        requests: vec![
            Request {
                url: "https://ads.site/a.js".into(),
                initiator: None,
                resource_type: ResourceType::Script,
            },
            Request {
                url: "https://example.com".into(),
                initiator: None,
                resource_type: ResourceType::Document,
            },
        ],
    };

    let json = serde_json::to_string(&input).unwrap();
    let out = simulate_json(&json).unwrap();

    let parsed: SimulateOutput = serde_json::from_str(&out).unwrap();

    assert_eq!(parsed.report.total, 2);
    assert_eq!(parsed.report.blocked, 1);
    assert_eq!(parsed.report.allowed, 1);
}
