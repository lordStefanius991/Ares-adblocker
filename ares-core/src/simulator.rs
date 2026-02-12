use crate::{evaluate, Decision, Profile, Request};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SimulationReport {
    pub total: usize,
    pub decisions: Vec<Decision>,
    pub blocked: usize,
    pub allowed: usize,
}

pub fn simulate(profile: &Profile, requests: &[Request]) -> SimulationReport {
    let mut decisions = Vec::with_capacity(requests.len());
    let mut blocked = 0usize;
    let mut allowed = 0usize;

    for req in requests {
        let d = evaluate(req, profile);
        match d.action {
            crate::Action::Block => blocked += 1,
            crate::Action::Allow => allowed += 1,
        }
        decisions.push(d);
    }

    SimulationReport {
        total: requests.len(),
        decisions,
        blocked,
        allowed,
    }
}
