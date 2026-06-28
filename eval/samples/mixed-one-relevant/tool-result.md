// src/validate.rs

/// Validate a phone.
pub fn validate_phone(input: &str) -> Result<(), ValidationError> {  // line ~10
    if input.is_empty() { return Err(ValidationError::Empty); }
    // ... ~15 lines of phone-specific checks ...
    let trimmed = input.trim();
    if trimmed.len() > 256 { return Err(ValidationError::TooLong); }
    Ok(())
}}

/// Validate a zip.
pub fn validate_zip(input: &str) -> Result<(), ValidationError> {  // line ~30
    if input.is_empty() { return Err(ValidationError::Empty); }
    // ... ~15 lines of zip-specific checks ...
    let trimmed = input.trim();
    if trimmed.len() > 256 { return Err(ValidationError::TooLong); }
    Ok(())
}}

/// Validate a username.
pub fn validate_username(input: &str) -> Result<(), ValidationError> {  // line ~55
    if input.is_empty() { return Err(ValidationError::Empty); }
    // ... ~15 lines of username-specific checks ...
    let trimmed = input.trim();
    if trimmed.len() > 256 { return Err(ValidationError::TooLong); }
    Ok(())
}}

/// Validate a password.
pub fn validate_password(input: &str) -> Result<(), ValidationError> {  // line ~80
    if input.is_empty() { return Err(ValidationError::Empty); }
    // ... ~15 lines of password-specific checks ...
    let trimmed = input.trim();
    if trimmed.len() > 256 { return Err(ValidationError::TooLong); }
    Ok(())
}}

/// Validate a url.
pub fn validate_url(input: &str) -> Result<(), ValidationError> {  // line ~120
    if input.is_empty() { return Err(ValidationError::Empty); }
    // ... ~15 lines of url-specific checks ...
    let trimmed = input.trim();
    if trimmed.len() > 256 { return Err(ValidationError::TooLong); }
    Ok(())
}}

/// Validate an email address per RFC 5322 (simplified).
pub fn validate_email(input: &str) -> Result<(), ValidationError> {  // line ~160
    let parts: Vec<&str> = input.split('@').collect();
    if parts.len() != 2 { return Err(ValidationError::BadEmail); }
    if parts[0].is_empty() || !parts[1].contains('.') { return Err(ValidationError::BadEmail); }
    Ok(())
}

pub fn validate_credit_card(input: &str) -> Result<(), ValidationError> {  // line ~200
    // ... unrelated credit card checks ...
    Ok(())
}}

pub fn validate_date(input: &str) -> Result<(), ValidationError> {  // line ~230
    // ... unrelated date checks ...
    Ok(())
}}

pub fn validate_hostname(input: &str) -> Result<(), ValidationError> {  // line ~260
    // ... unrelated hostname checks ...
    Ok(())
}}
