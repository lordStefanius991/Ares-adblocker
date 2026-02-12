use ares_core::*;

#[test]
fn simulation_counts_allow_block() {
    let profile = Profile {
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
    };

    let requests = vec![
        Request {
            url: "https://ads.example.com/a.js".into(),
            initiator: None,
            resource_type: ResourceType::Script,
        },
        Request {
            url: "https://example.com/home".into(),
            initiator: None,
            resource_type: ResourceType::Document,
        },
    ];

    let report = simulate(&profile, &requests);

    assert_eq!(report.total, 2);
    assert_eq!(report.blocked, 1);
    assert_eq!(report.allowed, 1);
    assert_eq!(report.decisions.len(), 2);
}
