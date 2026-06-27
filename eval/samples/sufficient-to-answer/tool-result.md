// src/auth.rs
use crate::http::Client;

/// Internal: build the auth header.
fn build_header(token: &str) -> String { format!("Bearer {}", token) }

/// Refresh an access token using a refresh token.
/// Returns a new TokenPair, or AuthError if the refresh token is expired/invalid.
pub async fn refresh_token(
    client: &Client,
    refresh_token: &str,
    scope: Option<&str>,
) -> Result<TokenPair, AuthError> {
    // ... 30 lines of impl: POST /oauth/token, parse, map errors ...
}

pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

fn unrelated_helper() { /* noise */ }
