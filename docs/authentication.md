# Devify Pay — Authentication & Rate Limiting

Devify Pay uses distinct authentication mechanisms for Merchant APIs and the Admin Panel.

---

## 1. Merchant API Key Authentication
Merchant requests require an API key passed in the `Authorization` header:

```http
Authorization: Bearer sk_test_8f92k3a1b7c4d9e2
```

### Security Properties
- **Key Format**: `sk_test_<random_hex>` or `sk_live_<random_hex>`
- **Storage**: Raw secret keys are displayed **only once** upon creation. Database stores only the **Argon2id** hash of the key.
- **Prefix Lookup**: Keys are matched using an indexed `keyPrefix` (`sk_test_8f92k3`) to prevent full table scans during verification.

---

## 2. Admin Session Authentication
The Admin dashboard uses HttpOnly, SameSite cookies storing session tokens (`devify_admin_session`).

### Security Properties
- Tokens are hashed in database session tables.
- 12-hour automatic expiration.
- Brute-force rate limiting blocks repeated login failures per IP / email account.

---

## 3. Rate Limit Tiers

| Tier | Window | Max Requests | Target Routes |
| :--- | :--- | :--- | :--- |
| **`auth`** | 60s | 10 req | `/v1/admin/auth/login` |
| **`public`** | 60s | 60 req | `/pay/:id` checkout pages |
| **`admin`** | 60s | 200 req | `/v1/admin/*` management routes |
| **`api`** | 60s | 300 req | `/v1/orders`, `/v1/payments`, etc. |
| **`webhook`** | 60s | 120 req | Webhook registration endpoints |
