   Compiling app v0.1.0
   Compiling serde v1.0
   Compiling tokio v1.40
warning: unused import: `std::fmt`
 --> src/util.rs:3:5
warning: 1 warning emitted
error[E0599]: no method named `unwrap_or_default` found for type `Config` in the current scope
  --> src/config.rs:88:24
   |
88 |     let port = cfg.port.unwrap_or_default();
   |                        ^^^^^^^^^^^^^^^^^ method not found in `Config`
error: aborting due to 1 previous error
   Compiling other stuff
   ... 40 more lines of compile chatter ...
