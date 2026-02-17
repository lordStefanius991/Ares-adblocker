use serde::{Deserialize, Serialize};

use crate::{evaluate, Decision, Profile, Request};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvaluateInput {
    pub profile: Profile,
    pub request: Request,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvaluateOutput {
    pub decision: Decision,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
}

pub fn evaluate_json(input_json: &str) -> Result<String, ApiError> {
    let input: EvaluateInput =
        serde_json::from_str(input_json).map_err(|e| ApiError { message: e.to_string() })?;

    let decision = evaluate(&input.request, &input.profile);

    let out = EvaluateOutput { decision };

    serde_json::to_string_pretty(&out).map_err(|e| ApiError { message: e.to_string() })
}




#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulateInput {
    pub profile: Profile,
    pub requests: Vec<Request>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SimulateOutput {
    pub report: crate::SimulationReport,
}

pub fn simulate_json(input_json: &str) -> Result<String, ApiError> {
    let input: SimulateInput =
        serde_json::from_str(input_json).map_err(|e| ApiError { message: e.to_string() })?;

    let report = crate::simulate(&input.profile, &input.requests);

    let out = SimulateOutput { report };

    serde_json::to_string_pretty(&out)
        .map_err(|e| ApiError { message: e.to_string() })
}
