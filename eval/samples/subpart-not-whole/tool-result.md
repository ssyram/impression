=== rg -n 'retry|backoff|delay|attempt|Retry' src/ ===
src/retry.rs:12:pub struct RetryConfig {
src/retry.rs:13:    pub max_attempts: u32,           // hard cap on attempts
src/retry.rs:14:    pub base_delay_ms: u64,          // starting delay
src/retry.rs:15:    pub max_delay_ms: u64,           // ceiling for any single wait
src/retry.rs:16:    pub jitter: bool,                // whether to randomize
src/retry.rs:31:impl RetryConfig {
src/retry.rs:32:    pub fn default_for_http() -> Self {
src/retry.rs:40:pub struct RetryState {
src/retry.rs:41:    pub attempt: u32,
src/retry.rs:42:    pub last_error: Option<String>,
src/retry.rs:43:    pub started_at: Instant,
src/retry.rs:58:pub fn should_retry(state: &RetryState, cfg: &RetryConfig) -> bool {
src/retry.rs:59:    state.attempt < cfg.max_attempts && !is_fatal(&state.last_error)
src/retry.rs:60:}
src/retry.rs:72:pub fn record_attempt(state: &mut RetryState, err: &str) {
src/retry.rs:73:    state.attempt += 1;
src/retry.rs:74:    state.last_error = Some(err.to_string());
src/retry.rs:75:}
src/retry.rs:91:pub async fn run_with_retry<F, T>(cfg: &RetryConfig, f: F) -> Result<T, Error> {
src/retry.rs:99:    let mut state = RetryState::new();
src/retry.rs:104:        match f().await {
src/retry.rs:105:            Ok(v) => return Ok(v),
src/retry.rs:112:            Err(e) if should_retry(&state, cfg) => {
src/retry.rs:120:                let delay = compute_backoff_delay(state.attempt, cfg);
src/retry.rs:121:                tokio::time::sleep(delay).await;
src/retry.rs:118:                record_attempt(&mut state, &e.to_string());
src/retry.rs:140:    fn test_should_retry_under_max() {
src/retry.rs:151:    fn test_record_attempt_increments() {
src/retry.rs:163:    fn test_run_with_retry_eventual_success() {
src/retry.rs:175:    fn test_is_fatal_on_4xx() {
src/http/client.rs:88:    let cfg = RetryConfig::default_for_http();
src/http/client.rs:90:    run_with_retry(&cfg, || self.send_once(req)).await
src/queue/worker.rs:212:    // retry handled by run_with_retry upstream
src/queue/worker.rs:240:    retry_count += 1; // local attempt counter, unrelated to backoff
src/retry.rs:180:fn compute_backoff_delay(attempt: u32, cfg: &RetryConfig) -> Duration {
src/retry.rs:181:    let exp = cfg.base_delay_ms.saturating_mul(2u64.saturating_pow(attempt));
src/retry.rs:182:    let capped = exp.min(cfg.max_delay_ms);
src/retry.rs:183:    Duration::from_millis(capped)
src/retry.rs:184:}
