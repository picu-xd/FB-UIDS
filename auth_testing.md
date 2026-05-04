# Auth Testing Playbook (FB Checker Mobile App)

This app uses **Bearer token JWT auth** (mobile-friendly, no httpOnly cookies).

## Credentials
- Admin: `admin@fbchecker.com` / `admin123`
- See `/app/memory/test_credentials.md`.

## MongoDB Verification
```
mongosh
use fb_checker_db
db.users.find({role: "admin"}).pretty()
db.users.findOne({role: "admin"}, {password_hash: 1})
```
Verify:
- bcrypt hash starts with `$2b$`
- `db.users.getIndexes()` shows unique index on `email`
- `db.login_attempts.getIndexes()` shows index on `identifier`
- `db.password_reset_tokens.getIndexes()` shows TTL index on `expires_at`

## API Testing (Bearer token flow)

### Register
```
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234","name":"Test"}'
```
Returns: `{"access_token": "...", "user": {...}}`

### Login
```
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fbchecker.com","password":"admin123"}'
```
Returns: `{"access_token": "...", "user": {...}}`

### Get current user
```
TOKEN="<access_token from login>"
curl http://localhost:8001/api/auth/me -H "Authorization: Bearer $TOKEN"
```

### Brute force (after 5 failures, 15 min lockout)
```
for i in 1 2 3 4 5 6; do
  curl -X POST http://localhost:8001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@fbchecker.com","password":"wrong"}'
done
```
6th attempt should return 429 Too Many Requests.

## Account Endpoints (auth required)

### Save parsed accounts (bulk)
```
curl -X POST http://localhost:8001/api/accounts/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accounts":[{"identifier":"100012345","password":"abc123","type":"uid"}]}'
```

### List accounts
```
curl http://localhost:8001/api/accounts -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8001/api/accounts?status=valid" -H "Authorization: Bearer $TOKEN"
```

### Mock check
```
curl -X POST http://localhost:8001/api/accounts/check \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_ids":["<id1>","<id2>"]}'
```

### Stats
```
curl http://localhost:8001/api/stats -H "Authorization: Bearer $TOKEN"
```

### Delete
```
curl -X DELETE http://localhost:8001/api/accounts/<id> -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:8001/api/accounts/bulk-delete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_ids":["<id1>","<id2>"]}'
```
