use serde::{Deserialize, Serialize};

use crate::ResourceType;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestLogEvent {
    pub ts_ms: u64,
    pub url: String,
    pub initiator: Option<String>,
    pub resource_type: ResourceType,

    // opzionale: se l’extension lo sa (DNR matched)
    pub matched_rule_id: Option<String>,
}

pub fn parse_log_events(json: &str) -> Result<Vec<RequestLogEvent>, serde_json::Error> {
    serde_json::from_str::<Vec<RequestLogEvent>>(json)
}
