HTTP 200
{
  "id": "usr_8f3a91c2",
  "email": "alice@example.com",
  "created_at": "2024-03-11T08:22:00Z",
  "updated_at": "2026-06-20T14:03:11Z",
  "status": "active",
  "email_verified": true,
  "phone_verified": false,
  "profile": {
    "display_name": "Alice Chen",
    "first_name": "Alice",
    "last_name": "Chen",
    "avatar_url": "https://cdn.example.com/a/8f3a.png",
    "locale": "en-US",
    "timezone": "America/Los_Angeles",
    "bio": "infra eng",
    "links": {
      "github": "alice",
      "twitter": null,
      "website": "alice.dev"
    }
  },
  "preferences": {
    "theme": "dark",
    "density": "comfortable",
    "notifications": {
      "email": true,
      "push": false,
      "sms": false,
      "digest": "weekly"
    },
    "marketing_opt_in": false,
    "beta_features": [
      "new_dashboard",
      "fast_search"
    ],
    "keyboard_shortcuts": true,
    "default_workspace": "ws_12"
  },
  "subscription": {
    "tier": "enterprise",
    "seats": 50,
    "seats_used": 37,
    "billing_cycle": "annual",
    "renews_at": "2027-03-11T00:00:00Z",
    "payment_method": "invoice",
    "trial": false,
    "discount_pct": 15,
    "contract_id": "ctr_990",
    "addons": [
      "sso",
      "audit_log",
      "priority_support"
    ]
  },
  "usage": {
    "api_calls_30d": 182340,
    "api_calls_total": 4920331,
    "storage_gb": 47.2,
    "last_active": "2026-06-28T09:10:00Z",
    "sessions_30d": 412,
    "avg_session_min": 23.5
  },
  "org": {
    "id": "org_55a1",
    "name": "Acme Corp",
    "role": "admin",
    "sso_enabled": true,
    "member_count": 214,
    "plan_owner": "usr_0001",
    "domains": [
      "acme.com",
      "acme.io"
    ]
  },
  "flags": {
    "is_internal": false,
    "grandfathered": true,
    "rate_limit_tier": 3,
    "feature_gate_v2": true
  },
  "addresses": [
    {
      "type": "billing",
      "line1": "500 Market St",
      "line2": "Suite 400",
      "city": "San Francisco",
      "state": "CA",
      "postal": "94105",
      "country": "US"
    }
  ],
  "integrations": [
    "slack",
    "github",
    "jira",
    "pagerduty",
    "datadog",
    "snowflake"
  ],
  "audit": {
    "last_login_ip": "203.0.113.7",
    "last_login_ua": "Mozilla/5.0",
    "mfa_enabled": true
  }
}
