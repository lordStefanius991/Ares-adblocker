use ares_core::*;

#[test]
fn parses_log_events() {
    let json = r#"
    [
      {
        "ts_ms": 1700000000000,
        "url": "https://ads.example.com/a.js",
        "initiator": null,
        "resource_type": "Script",
        "matched_rule_id": "r1"
      }
    ]
    "#;

    let events = parse_log_events(json).unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].resource_type, ResourceType::Script);
}
