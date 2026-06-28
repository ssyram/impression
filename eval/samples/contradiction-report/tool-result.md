// src/net/config.rs
/// Network configuration.
///
/// `connect_timeout`: how long to wait when establishing a connection.
/// Defaults to **30 seconds** if not specified.   <-- doc comment says 30s
pub struct NetConfig {
    pub connect_timeout: Duration,
    pub read_timeout: Duration,
    pub max_retries: u32,
}

impl Default for NetConfig {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(5),   // <-- code says 5s, NOT 30s
            read_timeout: Duration::from_secs(15),
            max_retries: 3,
        }
    }
}

/// Builder setter 0: override a field on the config.
pub fn with_field_0(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 0
    self
}

/// Builder setter 1: override a field on the config.
pub fn with_field_1(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 1
    self
}

/// Builder setter 2: override a field on the config.
pub fn with_field_2(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 2
    self
}

/// Builder setter 3: override a field on the config.
pub fn with_field_3(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 3
    self
}

/// Builder setter 4: override a field on the config.
pub fn with_field_4(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 4
    self
}

/// Builder setter 5: override a field on the config.
pub fn with_field_5(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 5
    self
}

/// Builder setter 6: override a field on the config.
pub fn with_field_6(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 6
    self
}

/// Builder setter 7: override a field on the config.
pub fn with_field_7(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 7
    self
}

/// Builder setter 8: override a field on the config.
pub fn with_field_8(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 8
    self
}

/// Builder setter 9: override a field on the config.
pub fn with_field_9(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 9
    self
}

/// Builder setter 10: override a field on the config.
pub fn with_field_10(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 10
    self
}

/// Builder setter 11: override a field on the config.
pub fn with_field_11(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 11
    self
}

/// Builder setter 12: override a field on the config.
pub fn with_field_12(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 12
    self
}

/// Builder setter 13: override a field on the config.
pub fn with_field_13(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 13
    self
}

/// Builder setter 14: override a field on the config.
pub fn with_field_14(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 14
    self
}

/// Builder setter 15: override a field on the config.
pub fn with_field_15(mut self, v: u32) -> Self {
    self.max_retries = v;  // setter 15
    self
}
