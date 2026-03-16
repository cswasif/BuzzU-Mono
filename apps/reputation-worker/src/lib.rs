use serde::{Deserialize, Serialize};
use worker::*;
use sha2::{Sha256, Digest};
use std::cell::RefCell;
use std::time::Duration;

// -- Free-Tier Guardrails -----------------------------------------------
// CF Durable Objects: 100K req/day free, 1GB storage.
// Each ReputationBucket handles 1/256 of the peer namespace
// (first 2 hex chars of SHA-256(peer_id)).
// All reads/writes are local SQLite — no external DB cost.
// Alarm-based decay keeps scores fresh without polling.
// -----------------------------------------------------------------------

const MAX_PAYLOAD_BYTES: usize = 8 * 1024;   // 8KB max request body
const MAX_REPORTS_PER_HOUR: u32 = 5;          // Rate limit per reporter
const DECAY_INTERVAL_MS: u64 = 3_600_000;     // 1 hour between decay runs
const DECAY_FACTOR: f64 = 0.995;              // Slow multiplicative decay
const BASE_SCORE: f64 = 50.0;                 // Starting trust score
const SESSION_BONUS: f64 = 2.0;               // Points per completed session
const REPORT_PENALTY: f64 = 10.0;             // Points deducted per report
const MIN_SCORE: f64 = 0.0;
const MAX_SCORE: f64 = 100.0;
const SHADOW_THRESHOLD: f64 = 20.0;           // Below this → shadow queue

// -----------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationRecord {
    pub peer_hash: String,
    pub trust_score: f64,
    pub reports_received: f64,
    pub sessions_completed: f64,
    pub flags: String,
    pub last_active: f64,
    pub created_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportRequest {
    pub reporter_hash: String,
    pub target_hash: String,
    pub reason: String,
    #[serde(default)]
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCompleteRequest {
    pub peer_hash: String,
    /// Duration in seconds — only sessions > 30s count for bonus
    #[serde(default)]
    pub duration_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationResponse {
    pub peer_hash: String,
    pub trust_score: f64,
    pub tier: String,
    pub shadow_queued: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueryRequest {
    pub peer_hashes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueryResponse {
    pub results: Vec<ReputationResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CountRow {
    cnt: f64,
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

fn now_ms() -> f64 {
    js_sys::Date::now()
}

const SLOW_SQL_MS: f64 = 25.0;

fn sql_exec_timed(sql: &SqlStorage, label: &str, query: &str) -> Result<SqlCursor> {
    let start = now_ms();
    let result = sql.exec(query, None);
    let dur = now_ms() - start;
    if dur >= SLOW_SQL_MS {
        console_log!("[Reputation][SlowSQL] {}ms {}", dur, label);
    }
    result
}

/// Hash a peer_id to a hex string for privacy-preserving storage.
pub fn hash_peer_id(peer_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(peer_id.as_bytes());
    hex_encode(hasher.finalize().as_slice())
}

/// Determine which bucket (first 2 hex chars) a peer_hash belongs to.
pub fn bucket_id(peer_hash: &str) -> String {
    if peer_hash.len() >= 2 {
        peer_hash[..2].to_lowercase()
    } else {
        "00".to_string()
    }
}

fn tier_name(score: f64) -> &'static str {
    if score >= 80.0 { "trusted" }
    else if score >= 50.0 { "normal" }
    else if score >= 20.0 { "cautioned" }
    else { "restricted" }
}

fn clamp_score(value: f64) -> f64 {
    if value < MIN_SCORE { MIN_SCORE }
    else if value > MAX_SCORE { MAX_SCORE }
    else { value }
}

fn to_response(rec: &ReputationRecord) -> ReputationResponse {
    ReputationResponse {
        peer_hash: rec.peer_hash.clone(),
        trust_score: (rec.trust_score * 100.0).round() / 100.0,
        tier: tier_name(rec.trust_score).to_string(),
        shadow_queued: rec.trust_score < SHADOW_THRESHOLD,
    }
}

fn default_reputation_response(peer_hash: &str) -> ReputationResponse {
    ReputationResponse {
        peer_hash: peer_hash.to_string(),
        trust_score: BASE_SCORE,
        tier: tier_name(BASE_SCORE).to_string(),
        shadow_queued: false,
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0xf) as usize] as char);
    }
    s
}

fn sanitize(input: &str) -> String {
    input.replace('\'', "''")
}

fn is_free_tier_write_quota_error(err: &worker::Error) -> bool {
    err.to_string()
        .contains("Exceeded allowed rows written in Durable Objects free tier")
}

fn parse_flags(flags_str: &str) -> Vec<String> {
    serde_json::from_str(flags_str).unwrap_or_default()
}

fn flags_to_string(flags: &[String]) -> String {
    serde_json::to_string(flags).unwrap_or_else(|_| "[]".to_string())
}

// -----------------------------------------------------------------------
// Durable Object: ReputationBucket
// -----------------------------------------------------------------------

#[durable_object]
pub struct ReputationBucket {
    state: State,
    #[allow(dead_code)]
    env: Env,
    initialized: RefCell<bool>,
}

impl DurableObject for ReputationBucket {
    fn new(state: State, env: Env) -> Self {
        Self {
            state,
            env,
            initialized: RefCell::new(false),
        }
    }

    async fn fetch(&self, req: Request) -> Result<Response> {
        let mut req = req;
        let url = req.url()?;
        let path = url.path();
        let method = req.method();

        if let Err(err) = self.ensure_tables().await {
            if is_free_tier_write_quota_error(&err) {
                if method == Method::Get && path.starts_with("/reputation/") {
                    let peer_hash = path.trim_start_matches("/reputation/").to_string();
                    if peer_hash.is_empty() || peer_hash.len() > 128 {
                        return Response::error("Invalid peer_hash", 400);
                    }
                    let fallback = ReputationResponse {
                        peer_hash,
                        trust_score: BASE_SCORE,
                        tier: tier_name(BASE_SCORE).to_string(),
                        shadow_queued: false,
                    };
                    return Response::from_json(&fallback);
                }
                return Response::error("Write quota exceeded. Retry later.", 429);
            }
            return Err(err);
        }

        // Route: GET /reputation/:peer_hash
        if method == Method::Get && path.starts_with("/reputation/") {
            let peer_hash = path.trim_start_matches("/reputation/").to_string();
            if peer_hash.is_empty() || peer_hash.len() > 128 {
                return Response::error("Invalid peer_hash", 400);
            }
            return self.get_reputation(&peer_hash);
        }

        // Route: POST /reputation/report
        if method == Method::Post && path == "/reputation/report" {
            let body = req.text().await?;
            if body.len() > MAX_PAYLOAD_BYTES {
                return Response::error("Payload too large", 413);
            }
            let report: ReportRequest = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => return Response::error(format!("Bad request: {}", e), 400),
            };
            return self.handle_report(report);
        }

        // Route: PATCH /reputation/complete-session
        if method == Method::Patch && path == "/reputation/complete-session" {
            let body = req.text().await?;
            if body.len() > MAX_PAYLOAD_BYTES {
                return Response::error("Payload too large", 413);
            }
            let session_req: SessionCompleteRequest = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => return Response::error(format!("Bad request: {}", e), 400),
            };
            return self.handle_session_complete(session_req);
        }

        // Route: POST /reputation/batch-query
        if method == Method::Post && path == "/reputation/batch-query" {
            let body = req.text().await?;
            if body.len() > MAX_PAYLOAD_BYTES {
                return Response::error("Payload too large", 413);
            }
            let batch: BatchQueryRequest = match serde_json::from_str(&body) {
                Ok(r) => r,
                Err(e) => return Response::error(format!("Bad request: {}", e), 400),
            };
            return self.handle_batch_query(batch);
        }

        // Route: POST /reputation/decay (manual trigger)
        if method == Method::Post && path == "/reputation/decay" {
            return self.run_decay();
        }

        Response::error("Not found", 404)
    }

    async fn alarm(&self) -> Result<Response> {
        if let Err(err) = self.ensure_tables().await {
            if is_free_tier_write_quota_error(&err) {
                return Response::ok("quota reached");
            }
            return Err(err);
        }
        let _ = self.run_decay();

        // Re-arm alarm
        let _ = self.state.storage().set_alarm(Duration::from_millis(DECAY_INTERVAL_MS)).await;
        Response::ok("alarm done")
    }
}

impl ReputationBucket {
    /// Create SQLite tables on first access.
    async fn ensure_tables(&self) -> Result<()> {
        if *self.initialized.borrow() {
            return Ok(());
        }

        let sql = self.state.storage().sql();

        sql_exec_timed(
            &sql,
            "ensure_tables:create_reputation",
            "CREATE TABLE IF NOT EXISTS reputation (
                peer_hash TEXT PRIMARY KEY,
                trust_score REAL NOT NULL DEFAULT 50.0,
                reports_received REAL NOT NULL DEFAULT 0,
                sessions_completed REAL NOT NULL DEFAULT 0,
                flags TEXT NOT NULL DEFAULT '[]',
                last_active REAL NOT NULL,
                created_at REAL NOT NULL
            )",
        )?;

        sql_exec_timed(
            &sql,
            "ensure_tables:create_reports",
            "CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reporter_hash TEXT NOT NULL,
                target_hash TEXT NOT NULL,
                reason TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                created_at REAL NOT NULL
            )",
        )?;

        sql_exec_timed(
            &sql,
            "ensure_tables:index_reports",
            "CREATE INDEX IF NOT EXISTS idx_reports_reporter_time
             ON reports(reporter_hash, created_at)",
        )?;

        sql_exec_timed(
            &sql,
            "ensure_tables:index_reputation",
            "CREATE INDEX IF NOT EXISTS idx_reputation_score
             ON reputation(trust_score)",
        )?;

        // Ensure alarm is armed for periodic decay
        let alarm = self.state.storage().get_alarm().await?;
        if alarm.is_none() {
            let _ = self.state.storage().set_alarm(Duration::from_millis(DECAY_INTERVAL_MS)).await;
        }

        *self.initialized.borrow_mut() = true;
        Ok(())
    }

    fn get_record(&self, peer_hash: &str) -> Result<Option<ReputationRecord>> {
        let sql = self.state.storage().sql();
        let safe_hash = sanitize(peer_hash);
        let rows: Vec<ReputationRecord> = sql_exec_timed(
            &sql,
            "get_record:select",
            &format!(
                "SELECT peer_hash, trust_score, reports_received, sessions_completed, flags, last_active, created_at
                 FROM reputation WHERE peer_hash = '{}'",
                safe_hash
            ),
        )?.to_array()?;
        Ok(rows.into_iter().next())
    }

    /// Get or create a reputation record.
    fn get_or_create_record(&self, peer_hash: &str) -> Result<ReputationRecord> {
        let now = now_ms();
        if let Some(rec) = self.get_record(peer_hash)? {
            return Ok(rec);
        }

        let sql = self.state.storage().sql();
        let safe_hash = sanitize(peer_hash);
        // Create new record with BASE_SCORE
        if let Err(err) = sql_exec_timed(
            &sql,
            "get_or_create_record:insert",
            &format!(
                "INSERT INTO reputation (peer_hash, trust_score, reports_received, sessions_completed, flags, last_active, created_at)
                 VALUES ('{}', {}, 0, 0, '[]', {}, {})",
                safe_hash, BASE_SCORE, now, now
            ),
        ) {
            if !is_free_tier_write_quota_error(&err) {
                return Err(err);
            }
        }

        Ok(ReputationRecord {
            peer_hash: peer_hash.to_string(),
            trust_score: BASE_SCORE,
            reports_received: 0.0,
            sessions_completed: 0.0,
            flags: "[]".to_string(),
            last_active: now,
            created_at: now,
        })
    }

    /// Save a reputation record back to SQLite.
    fn save_record(&self, rec: &ReputationRecord) -> Result<()> {
        let sql = self.state.storage().sql();

        sql_exec_timed(
            &sql,
            "save_record:update",
            &format!(
                "UPDATE reputation SET trust_score = {}, reports_received = {}, sessions_completed = {}, flags = '{}', last_active = {}
                 WHERE peer_hash = '{}'",
                rec.trust_score, rec.reports_received as u32, rec.sessions_completed as u32,
                sanitize(&rec.flags), rec.last_active, sanitize(&rec.peer_hash)
            ),
        )?;

        Ok(())
    }

    /// GET /reputation/:peer_hash
    fn get_reputation(&self, peer_hash: &str) -> Result<Response> {
        let response = match self.get_record(peer_hash)? {
            Some(rec) => to_response(&rec),
            None => default_reputation_response(peer_hash),
        };
        Response::from_json(&response)
    }

    /// POST /reputation/report
    fn handle_report(&self, report: ReportRequest) -> Result<Response> {
        if report.reporter_hash.is_empty() || report.target_hash.is_empty() {
            return Response::error("reporter_hash and target_hash required", 400);
        }
        if report.reason.is_empty() || report.reason.len() > 500 {
            return Response::error("reason must be 1-500 chars", 400);
        }
        if report.reporter_hash == report.target_hash {
            return Response::error("Cannot report yourself", 400);
        }

        let now = now_ms();
        let one_hour_ago = now - 3_600_000.0;
        let sql = self.state.storage().sql();

        // Rate limit check
        let count_rows: Vec<CountRow> = sql_exec_timed(
            &sql,
            "handle_report:rate_limit",
            &format!(
                "SELECT COUNT(*) as cnt FROM reports WHERE reporter_hash = '{}' AND created_at > {}",
                sanitize(&report.reporter_hash), one_hour_ago
            ),
        )?.to_array()?;

        if let Some(row) = count_rows.first() {
            if row.cnt as u32 >= MAX_REPORTS_PER_HOUR {
                return Response::error("Rate limit: too many reports", 429);
            }
        }

        // Persist report
        if let Err(err) = sql_exec_timed(
            &sql,
            "handle_report:insert_report",
            &format!(
                "INSERT INTO reports (reporter_hash, target_hash, reason, details, created_at)
                 VALUES ('{}', '{}', '{}', '{}', {})",
                sanitize(&report.reporter_hash),
                sanitize(&report.target_hash),
                sanitize(&report.reason),
                sanitize(&report.details),
                now
            ),
        ) {
            if is_free_tier_write_quota_error(&err) {
                return Response::error("Write quota exceeded. Retry later.", 429);
            }
            return Err(err);
        }

        // Update target reputation
        let mut rec = self.get_or_create_record(&report.target_hash)?;
        rec.reports_received += 1.0;
        rec.trust_score = clamp_score(rec.trust_score - REPORT_PENALTY);
        rec.last_active = now;

        // Add shadow flag if score drops below threshold
        let mut flags = parse_flags(&rec.flags);
        if rec.trust_score < SHADOW_THRESHOLD && !flags.contains(&"shadow_queued".to_string()) {
            flags.push("shadow_queued".to_string());
            rec.flags = flags_to_string(&flags);
        }

        if let Err(err) = self.save_record(&rec) {
            if is_free_tier_write_quota_error(&err) {
                return Response::error("Write quota exceeded. Retry later.", 429);
            }
            return Err(err);
        }
        Response::from_json(&to_response(&rec))
    }

    /// PATCH /reputation/complete-session
    fn handle_session_complete(&self, req: SessionCompleteRequest) -> Result<Response> {
        if req.peer_hash.is_empty() {
            return Response::error("peer_hash required", 400);
        }
        if req.duration_secs < 30 {
            return Response::error("Session too short (< 30s)", 400);
        }

        let now = now_ms();
        let mut rec = self.get_or_create_record(&req.peer_hash)?;
        rec.sessions_completed += 1.0;
        rec.trust_score = clamp_score(rec.trust_score + SESSION_BONUS);
        rec.last_active = now;

        // Remove shadow flag if score recovered
        if rec.trust_score >= SHADOW_THRESHOLD {
            let mut flags = parse_flags(&rec.flags);
            flags.retain(|f| f != "shadow_queued");
            rec.flags = flags_to_string(&flags);
        }

        if let Err(err) = self.save_record(&rec) {
            if is_free_tier_write_quota_error(&err) {
                return Response::error("Write quota exceeded. Retry later.", 429);
            }
            return Err(err);
        }
        Response::from_json(&to_response(&rec))
    }

    /// POST /reputation/batch-query
    fn handle_batch_query(&self, query: BatchQueryRequest) -> Result<Response> {
        if query.peer_hashes.len() > 50 {
            return Response::error("Max 50 peers per batch query", 400);
        }

        let mut results = Vec::new();
        for hash in &query.peer_hashes {
            let response = match self.get_record(hash)? {
                Some(rec) => to_response(&rec),
                None => default_reputation_response(hash),
            };
            results.push(response);
        }

        Response::from_json(&BatchQueryResponse { results })
    }

    /// Decay all scores toward baseline — called by alarm.
    fn run_decay(&self) -> Result<Response> {
        let sql = self.state.storage().sql();

        // Multiplicative decay for high scores, additive recovery for low scores
        sql_exec_timed(
            &sql,
            "run_decay:update_scores",
            &format!(
                "UPDATE reputation SET trust_score =
                    CASE
                        WHEN trust_score > {} THEN MAX({}, trust_score * {})
                        WHEN trust_score < {} THEN MIN({}, trust_score + 0.5)
                        ELSE trust_score
                    END",
                BASE_SCORE, BASE_SCORE, DECAY_FACTOR,
                BASE_SCORE, BASE_SCORE
            ),
        )?;

        // Clean old reports (> 30 days)
        let thirty_days_ago = now_ms() - (30.0 * 24.0 * 3_600_000.0);
        sql_exec_timed(
            &sql,
            "run_decay:delete_reports",
            &format!("DELETE FROM reports WHERE created_at < {}", thirty_days_ago),
        )?;

        // Clear shadow flags for recovered users
        sql_exec_timed(
            &sql,
            "run_decay:clear_shadow_flags",
            &format!(
                "UPDATE reputation SET flags = '[]' WHERE trust_score >= {} AND flags LIKE '%shadow_queued%'",
                SHADOW_THRESHOLD
            ),
        )?;

        Response::ok("decay complete")
    }
}

// -----------------------------------------------------------------------
// Router — routes requests to the correct ReputationBucket shard
// -----------------------------------------------------------------------

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let cors_headers = |resp: Response| -> Result<Response> {
        let headers = Headers::new();
        headers.set("Access-Control-Allow-Origin", "*")?;
        headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")?;
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")?;
        headers.set("Access-Control-Max-Age", "86400")?;
        Ok(resp.with_headers(headers))
    };

    // CORS preflight
    if req.method() == Method::Options {
        return cors_headers(Response::empty()?);
    }

    let url = req.url()?;
    let path = url.path();

    let shard_key = extract_shard_key(&path, &url);
    if shard_key.is_empty() {
        return cors_headers(Response::error("Missing peer identifier", 400)?);
    }

    let shard_name = bucket_id(&shard_key);
    let namespace = env.durable_object("REPUTATION_BUCKET")?;
    let stub = namespace.id_from_name(&shard_name)?.get_stub()?;

    let is_get = req.method() == Method::Get;
    let resp = match stub.fetch_with_request(req).await {
        Ok(resp) => resp,
        Err(err) => {
            if path.starts_with("/reputation/") {
                if path.starts_with("/reputation/")
                    && !path.contains("report")
                    && !path.contains("complete-session")
                    && !path.contains("batch-query")
                    && !path.contains("decay")
                    && is_get
                {
                    let peer_hash = path.trim_start_matches("/reputation/").to_string();
                    if !peer_hash.is_empty() && peer_hash.len() <= 128 {
                        let fallback = ReputationResponse {
                            peer_hash,
                            trust_score: BASE_SCORE,
                            tier: tier_name(BASE_SCORE).to_string(),
                            shadow_queued: false,
                        };
                        return cors_headers(Response::from_json(&fallback)?);
                    }
                }
                return cors_headers(Response::error("Reputation write quota exceeded. Retry later.", 429)?);
            }
            return Err(err);
        }
    };
    if path.starts_with("/reputation/") && resp.status_code() == 500 {
        if !path.contains("report")
            && !path.contains("complete-session")
            && !path.contains("batch-query")
            && !path.contains("decay")
            && is_get
        {
            let peer_hash = path.trim_start_matches("/reputation/").to_string();
            if !peer_hash.is_empty() && peer_hash.len() <= 128 {
                let fallback = ReputationResponse {
                    peer_hash,
                    trust_score: BASE_SCORE,
                    tier: tier_name(BASE_SCORE).to_string(),
                    shadow_queued: false,
                };
                return cors_headers(Response::from_json(&fallback)?);
            }
        }
        return cors_headers(Response::error("Reputation write quota exceeded. Retry later.", 429)?);
    }
    cors_headers(resp)
}

/// Extract the shard key (peer_hash) from the request path or query params.
fn extract_shard_key(path: &str, url: &Url) -> String {
    // GET /reputation/:peer_hash
    if path.starts_with("/reputation/")
        && !path.contains("report")
        && !path.contains("complete-session")
        && !path.contains("batch-query")
        && !path.contains("decay")
    {
        return path.trim_start_matches("/reputation/").to_string();
    }

    // POST /reputation/report → shard by ?target= query param
    if path == "/reputation/report" {
        for (k, v) in url.query_pairs() {
            if k == "target" { return v.to_string(); }
        }
        return "00".to_string();
    }

    // PATCH /reputation/complete-session → shard by ?peer= query param
    if path == "/reputation/complete-session" {
        for (k, v) in url.query_pairs() {
            if k == "peer" { return v.to_string(); }
        }
        return "00".to_string();
    }

    // POST /reputation/batch-query or /reputation/decay → default shard
    if path == "/reputation/batch-query" || path == "/reputation/decay" {
        return "00".to_string();
    }

    String::new()
}
