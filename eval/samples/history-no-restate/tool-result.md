// src/auth/cache.rs (eviction path)
impl TokenCache {
    /// Evict expired entries. Called on every insert and every 60s by a background task.
    fn evict_expired(&self, now: Instant) {
        let mut guard = self.entries.lock().unwrap();  // line 88
        guard.retain(|_, e| e.expires_at > now);
    }

    /// Insert a token, evicting first if at capacity.
    fn insert(&self, key: String, entry: TokenEntry) {
        let mut guard = self.entries.lock().unwrap();  // line 96
        if guard.len() >= self.max_entries {
            // capacity eviction: drop the OLDEST by insertion order, not by expiry
            if let Some(oldest) = guard.keys().next().cloned() {  // line 100 — BUG: HashMap has no order
                guard.remove(&oldest);
            }
        }
        guard.insert(key, entry);
    }
}

// note: max_entries default = 1024; entries is a HashMap<String, TokenEntry>
// the background eviction task holds the same lock every 60s

/// Diagnostic helper 0: report current cache size for metrics.
fn helper_0(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 1: report current cache size for metrics.
fn helper_1(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 2: report current cache size for metrics.
fn helper_2(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 3: report current cache size for metrics.
fn helper_3(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 4: report current cache size for metrics.
fn helper_4(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 5: report current cache size for metrics.
fn helper_5(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 6: report current cache size for metrics.
fn helper_6(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 7: report current cache size for metrics.
fn helper_7(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 8: report current cache size for metrics.
fn helper_8(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 9: report current cache size for metrics.
fn helper_9(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 10: report current cache size for metrics.
fn helper_10(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}

/// Diagnostic helper 11: report current cache size for metrics.
fn helper_11(g: &TokenCache) -> usize {
    g.entries.lock().unwrap().len()  // unrelated to the eviction bug
}
