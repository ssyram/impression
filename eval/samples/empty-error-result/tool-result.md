=== rg -n 'retry_timeout|backoff|retry_delay' . ===
docs/architecture.md:88:the retry_timeout should eventually be configurable
docs/architecture.md:142:- [ ] expose retry_timeout in config (not done yet)
docs/design/network.md:30:retry/backoff strategy is described conceptually here, not implemented
docs/design/network.md:51:retry_delay between attempts: TBD, currently fixed
CHANGELOG.md:23:- planned: retry_timeout configuration (deferred to next release)
CHANGELOG.md:24:- planned: configurable backoff (deferred)
tests/integration.rs:201:    // NOTE: retry_timeout is hard-coded, can't test override here
tests/integration.rs:340:    // FIXME: retry_timeout not yet wired to config
tests/unit/net.rs:55:    // backoff is fixed in code; no config hook to assert
src/net/mod.rs:14:    // TODO: make retry_timeout configurable; currently a const below
src/net/mod.rs:15:    const RETRY_TIMEOUT_MS: u64 = 5000; // hard-coded, not from config
src/net/mod.rs:16:    const RETRY_DELAY_MS: u64 = 200; // also hard-coded
README.md:67:Configuration of retry_timeout is on the roadmap.
README.md:68:Backoff/retry_delay tuning is not yet supported.
src/lib.rs:3://! retry_timeout: see net/mod.rs (hard-coded for now)
notes/todo.txt:5:make retry_timeout an env var someday
notes/todo.txt:6:and retry_delay too
examples/client.rs:40:// uses default retry behavior; cannot override retry_timeout
=== rg -n 'retry_timeout' config/ .env *.toml 2>/dev/null ===
(no output)
=== ls config/ 2>&1 ===
ls: cannot access 'config/': No such file or directory
=== fd -e toml -e env . 2>/dev/null ===
(no output)
=== rg -n 'timeout|backoff' src/main.rs ===
(no output)
=== rg -n 'timeout|backoff' src/handler.rs ===
(no output)
=== rg -n 'timeout|backoff' src/session.rs ===
(no output)
=== rg -n 'timeout|backoff' src/app.rs ===
(no output)
