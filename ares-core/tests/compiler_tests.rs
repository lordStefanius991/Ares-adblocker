use ares_core::*;

#[test]
fn compiles_profile() {
    let profile = Profile {
        id: "p".into(),
        name: "test".into(),
        enabled: true,
        rules: vec![Rule {
            id: "r".into(),
            description: "block ads".into(),
            action: Action::Block,
            pattern: "ads".into(),
            priority: 5,
        }],
    };

    let compiled = compile_profile(&profile);

    assert_eq!(compiled.len(), 1);
    assert_eq!(compiled[0].url_filter, "ads");
}
