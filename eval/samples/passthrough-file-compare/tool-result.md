# prod/config.yaml
service:
  name: api-gateway
  port: 8443
  workers: 16
  max_connections: 4096
  keepalive_timeout_ms: 30000
  request_timeout_ms: 15000
  shutdown_grace_ms: 20000
tls:
  enabled: true
  min_version: "1.2"
  cert_path: /etc/certs/prod/fullchain.pem
  key_path: /etc/certs/prod/privkey.pem
  ciphers: "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256"
  hsts_max_age: 63072000
database:
  host: prod-db-primary.internal
  port: 5432
  pool_min: 8
  pool_max: 64
  statement_timeout_ms: 10000
  idle_in_transaction_timeout_ms: 30000
  ssl_mode: require
  replica_hosts:
    - prod-db-replica-1.internal
    - prod-db-replica-2.internal
cache:
  backend: redis
  host: prod-redis.internal
  port: 6379
  ttl_seconds: 3600
  max_memory_mb: 8192
  eviction_policy: allkeys-lru
rate_limit:
  enabled: true
  requests_per_minute: 6000
  burst: 200
  per_ip: true
logging:
  level: warn
  format: json
  sample_rate: 0.1
  destinations:
    - stdout
    - /var/log/api-gateway/app.log
feature_flags:
  new_router: true
  async_audit: true
  legacy_fallback: false
  shadow_traffic_pct: 5
observability:
  metrics_port: 9090
  trace_sample_rate: 0.05
  otlp_endpoint: http://otel-collector.internal:4317
auth:
  jwt_issuer: https://auth.prod.internal
  jwt_audience: api-gateway-prod
  access_token_ttl_s: 900
  refresh_token_ttl_s: 1209600
  clock_skew_s: 30
  allowed_algorithms:
    - RS256
    - ES256
  jwks_uri: https://auth.prod.internal/.well-known/jwks.json
  jwks_cache_ttl_s: 3600
cors:
  enabled: true
  allowed_origins:
    - https://app.example.com
    - https://admin.example.com
  allowed_methods:
    - GET
    - POST
    - PUT
    - DELETE
  allowed_headers:
    - Authorization
    - Content-Type
    - X-Request-Id
  max_age_s: 86400
  allow_credentials: true
retries:
  upstream_max_attempts: 3
  upstream_base_delay_ms: 100
  upstream_max_delay_ms: 2000
  upstream_jitter: true
  circuit_breaker_threshold: 0.5
  circuit_breaker_window_s: 30
  circuit_breaker_cooldown_s: 60
queue:
  broker: kafka
  brokers:
    - prod-kafka-1.internal:9092
    - prod-kafka-2.internal:9092
    - prod-kafka-3.internal:9092
  consumer_group: api-gateway-prod
  max_poll_records: 500
  session_timeout_ms: 45000
  enable_auto_commit: false
