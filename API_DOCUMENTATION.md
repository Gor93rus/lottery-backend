# API Documentation

Complete reference for all Weekend Special Lottery Backend API endpoints.

## Base URL

```
Development: http://localhost:3001
Production: https://your-domain.com
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

Get your token by calling `/api/auth/telegram` endpoint.

---

## Health Check

### GET /api/health

Check server and database health status.

**Authentication:** None required

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-25T20:00:00.000Z",
  "environment": "development",
  "database": "connected",
  "services": {
    "activeLotteries": 1,
    "scheduledDraws": 1
  }
}
```

---

## Authentication Endpoints

### POST /api/auth/telegram

Login or register user via Telegram authentication.

**Authentication:** None required

**Request Body:**
```json
{
  "id": "123456789",
  "first_name": "John",
  "last_name": "Doe",
  "username": "johndoe",
  "photo_url": "https://...",
  "auth_date": 1706212800,
  "hash": "abc123..."
}
```

**Required Fields:**
- `id` - Telegram user ID
- `hash` - Telegram authentication hash
- `auth_date` - Unix timestamp of authentication

**Response:**
```json
{
  "success": true,
  "isNewUser": false,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "telegramId": "123456789",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "photoUrl": "https://...",
    "tonWallet": null,
    "balance": 0,
    "level": 1,
    "experience": 0,
    "referralCode": "abc123def456"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Missing required fields or invalid format
  ```json
  {
    "error": "Bad Request",
    "message": "Missing required field: id"
  }
  ```
  ```json
  {
    "error": "Bad Request",
    "message": "Missing required field: hash"
  }
  ```
  ```json
  {
    "error": "Bad Request",
    "message": "Missing required field: auth_date"
  }
  ```
  ```json
  {
    "error": "Bad Request",
    "message": "Invalid auth_date format: must be a number"
  }
  ```

- `401 Unauthorized` - Invalid hash verification
  ```json
  {
    "error": "Unauthorized",
    "message": "Invalid authentication data"
  }
  ```

- `401 Unauthorized` - Expired or future auth data
  ```json
  {
    "error": "Unauthorized",
    "message": "Authentication data expired"
  }
  ```

- `500 Internal Server Error` - Bot token not configured in production
  ```json
  {
    "error": "Internal Server Error",
    "message": "Server configuration error"
  }
  ```

**Notes:**
- Creates new user if not exists
- Updates existing user profile
- Returns JWT token valid for 30 days
- Sends welcome message via Telegram bot for new users
- Hash is cryptographically verified using HMAC-SHA256
- Auth data expires after 24 hours
- Bot token verification is required in production, optional in development

---

### POST /api/auth/connect-wallet

Connect TON wallet to authenticated user account.

**Authentication:** Required

**Request Body:**
```json
{
  "walletAddress": "0QDAy6M4QQRcIy8jLl4n4acb7IxmDnPZiBqz7A_6xvY90GeY",
  "walletVersion": "v4"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Wallet connected successfully",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tonWallet": "0QDAy6M4QQRcIy8jLl4n4acb7IxmDnPZiBqz7A_6xvY90GeY",
    "tonWalletVersion": "v4"
  }
}
```

**Errors:**
- `400` - Invalid wallet address
- `409` - Wallet already connected to another account

---

## Lottery Endpoints

### GET /api/lottery/list

Get list of active lotteries with next draw information.

**Authentication:** Optional (enhanced response if authenticated)

**Query Parameters:**
- `active` - Filter by active status (default: "true")
- `featured` - Filter by featured status (optional)

**Response:**
```json
{
  "success": true,
  "lotteries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "weekend-special",
      "name": "Weekend Special",
      "description": "Классическая лотерея 5 из 36...",
      "numbersCount": 5,
      "numbersMax": 36,
      "ticketPrice": 1.0,
      "jackpot": 500.0,
      "active": true,
      "featured": true,
      "prizeStructure": {
        "5": 500,
        "4": 50,
        "3": 5,
        "2": 0.5,
        "1": "free_ticket"
      },
      "nextDraw": {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "drawNumber": 1,
        "scheduledAt": "2024-01-25T15:00:00.000Z"
      }
    }
  ]
}
```

---

### GET /api/lottery/:slug/info

Get detailed information about a specific lottery.

**Authentication:** Optional

**URL Parameters:**
- `slug` - Lottery slug (e.g., "weekend-special")

**Response:**
```json
{
  "success": true,
  "lottery": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "weekend-special",
    "name": "Weekend Special",
    "description": "Классическая лотерея 5 из 36...",
    "numbersCount": 5,
    "numbersMax": 36,
    "ticketPrice": 1.0,
    "jackpot": 500.0,
    "drawTime": "18:00",
    "drawTimezone": "Europe/Moscow",
    "active": true,
    "featured": true,
    "prizeStructure": {
      "5": 500,
      "4": 50,
      "3": 5,
      "2": 0.5,
      "1": "free_ticket"
    }
  },
  "nextDraw": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "drawNumber": 1,
    "scheduledAt": "2024-01-25T15:00:00.000Z",
    "totalTickets": 42,
    "totalPrizePool": 42.0
  },
  "statistics": {
    "totalDraws": 10,
    "totalTicketsSold": 420,
    "totalPrizesAwarded": 1250.5
  },
  "recentDraws": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440000",
      "drawNumber": 10,
      "executedAt": "2024-01-24T15:00:00.000Z",
      "winningNumbers": [5, 12, 23, 31, 36],
      "totalWinners": 3,
      "totalPaid": 55.5
    }
  ]
}
```

**Errors:**
- `404` - Lottery not found

---

### POST /api/lottery/:slug/buy-ticket

Purchase a lottery ticket for the next draw.

**Authentication:** Required

**URL Parameters:**
- `slug` - Lottery slug

**Request Body:**
```json
{
  "numbers": [5, 12, 23, 31, 36],
  "transactionHash": "abc123def456..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ticket purchased successfully",
  "ticket": {
    "id": "880e8400-e29b-41d4-a716-446655440000",
    "numbers": [5, 12, 23, 31, 36],
    "drawNumber": 1,
    "scheduledAt": "2024-01-25T15:00:00.000Z",
    "status": "active"
  },
  "transaction": {
    "id": "990e8400-e29b-41d4-a716-446655440000",
    "hash": "abc123def456...",
    "amount": 1.0,
    "status": "confirmed"
  }
}
```

**Validation:**
- Numbers must be unique
- Must select exactly `numbersCount` numbers
- Numbers must be between 1 and `numbersMax`
- Transaction must be valid and confirmed (if hash provided)
- Lottery must be active
- Next draw must be available

**Errors:**
- `400` - Invalid numbers or transaction
- `404` - Lottery not found

**Notes:**
- Awards 10 XP to user
- Sends Telegram notification
- Updates draw statistics

---

### GET /api/lottery/:slug/my-tickets

Get authenticated user's tickets for a specific lottery.

**Authentication:** Required

**URL Parameters:**
- `slug` - Lottery slug

**Query Parameters:**
- `status` - Filter by status (optional)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "tickets": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440000",
      "numbers": [5, 12, 23, 31, 36],
      "status": "active",
      "matchedNumbers": 0,
      "prizeAmount": 0,
      "prizeClaimed": false,
      "createdAt": "2024-01-25T10:00:00.000Z",
      "draw": {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "drawNumber": 1,
        "scheduledAt": "2024-01-25T15:00:00.000Z",
        "executedAt": null,
        "winningNumbers": [],
        "status": "scheduled"
      },
      "transaction": {
        "id": "990e8400-e29b-41d4-a716-446655440000",
        "hash": "abc123...",
        "amount": 1.0,
        "status": "confirmed"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

**Errors:**
- `404` - Lottery not found

---

## Draws Endpoints

### GET /api/draws/current

Get current/upcoming draws for all active lotteries.

**Authentication:** Optional

**Query Parameters:**
- `lotterySlug` - Filter by specific lottery (optional)

**Response:**
```json
{
  "success": true,
  "draws": [
    {
      "lottery": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "weekend-special",
        "name": "Weekend Special",
        "ticketPrice": 1.0,
        "jackpot": 500.0,
        "numbersCount": 5,
        "numbersMax": 36
      },
      "draw": {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "drawNumber": 1,
        "scheduledAt": "2024-01-25T15:00:00.000Z",
        "totalTickets": 42,
        "totalPrizePool": 42.0,
        "status": "scheduled",
        "timeRemaining": {
          "hours": 4,
          "minutes": 30,
          "milliseconds": 16200000
        }
      }
    }
  ],
  "count": 1
}
```

---

## User Endpoints

### GET /api/user/profile

Get authenticated user's profile with statistics.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "telegramId": "123456789",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "photoUrl": "https://...",
    "tonWallet": "0QDAy6M4QQRcIy8jLl4n4acb7IxmDnPZiBqz7A_6xvY90GeY",
    "tonWalletVersion": "v4",
    "balance": 0,
    "referralCode": "abc123def456",
    "referredBy": null,
    "totalSpent": 10.0,
    "totalWon": 5.5,
    "level": 2,
    "experience": 120,
    "streak": 3,
    "lastActiveAt": "2024-01-25T20:00:00.000Z",
    "createdAt": "2024-01-20T10:00:00.000Z"
  },
  "statistics": {
    "totalTickets": 10,
    "activeTickets": 3,
    "winningTickets": 2,
    "winRate": "20.00",
    "netProfit": -4.5
  },
  "notifications": {
    "unread": 2,
    "recent": [
      {
        "id": "aa0e8400-e29b-41d4-a716-446655440000",
        "type": "prize_won",
        "title": "Поздравляем!",
        "message": "Вы выиграли 5 TON!",
        "link": null,
        "actionLabel": null,
        "read": false,
        "createdAt": "2024-01-25T15:05:00.000Z"
      }
    ]
  }
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Detailed error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "No authorization token provided"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 409 Conflict
```json
{
  "error": "Conflict",
  "message": "Resource conflict message"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Something went wrong"
}
```

### 503 Service Unavailable
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-25T20:00:00.000Z",
  "database": "disconnected",
  "error": "Database connection failed"
}
```

---

## Rate Limiting

Rate limiting is **ENABLED** to protect the API from abuse and ensure fair usage for all users.

### Rate Limit Categories

#### 1. General API Limiter
- **Applies to:** All `/api/*` routes (except health check)
- **Limit:** 100 requests per 15 minutes per IP address
- **Window:** 15 minutes

#### 2. Authentication Limiter (Strict)
- **Applies to:** `/api/auth/*` routes
  - `/api/auth/telegram`
  - `/api/auth/connect-wallet`
- **Limit:** 5 requests per 15 minutes per IP address
- **Window:** 15 minutes
- **Purpose:** Prevent brute-force attacks

#### 3. Ticket Purchase Limiter
- **Applies to:** Ticket purchase endpoints
  - `/api/lottery/*/buy-ticket`
  - `/api/lottery/buy-tickets`
  - `/api/tickets/purchase*`
- **Limit:** 10 requests per 1 minute per IP address
- **Window:** 1 minute
- **Purpose:** Prevent spam and abuse

#### 4. Admin Limiter
- **Applies to:** `/api/admin/*` routes
- **Limit:** 200 requests per 15 minutes per IP address
- **Window:** 15 minutes

### Response Headers

All API responses include rate limit information in headers:

```
RateLimit-Limit: 100           # Maximum requests allowed in window
RateLimit-Remaining: 95        # Remaining requests in current window
RateLimit-Reset: 1706284800    # Unix timestamp when limit resets
```

### Rate Limit Exceeded Response

When you exceed the rate limit, the API returns a `429 Too Many Requests` status with:

```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 900
}
```

The `Retry-After` header (in seconds) indicates when you can retry the request.

### Category-Specific Messages

Different endpoint categories return customized messages:

**Authentication endpoints:**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Too many authentication attempts, please try again later",
  "retryAfter": 900
}
```

**Ticket purchase endpoints:**
```json
{
  "success": false,
  "error": "Too Many Requests",
  "message": "Too many purchase attempts, please slow down",
  "retryAfter": 60
}
```

### Best Practices

1. **Monitor Headers:** Check rate limit headers in responses to track your usage
2. **Implement Backoff:** If you receive a 429 response, wait for the `retryAfter` period
3. **Cache Responses:** Cache lottery info and other static data to reduce API calls
4. **Batch Operations:** Use bulk endpoints when available (e.g., `buy-tickets` instead of multiple `buy-ticket` calls)
5. **Production Deployment:** Implement client-side rate limiting to avoid hitting server limits

### Rate Limit Per IP

Rate limits are applied **per IP address**. Each unique IP address has its own independent counter. This ensures fair usage across all users.

---

## Security Headers

The API includes comprehensive security headers (via helmet middleware) to protect against common web vulnerabilities:

### Included Headers

- **X-Content-Type-Options: nosniff** - Prevents MIME type sniffing attacks
- **X-Frame-Options: SAMEORIGIN** - Prevents clickjacking by disallowing iframe embedding from other origins
- **X-XSS-Protection: 0** - Modern helmet sets this to 0 to disable legacy XSS protection (CSP is the modern alternative)
- **Strict-Transport-Security** - Enforces HTTPS connections (max-age: 31536000 seconds / 365 days)
- **Content-Security-Policy** - Restricts resource loading to prevent XSS attacks
  - `default-src 'self'` - Only allow resources from same origin by default
  - `style-src 'self' 'unsafe-inline'` - Allow inline styles
  - `script-src 'self'` - Only allow scripts from same origin
  - `img-src 'self' data: https:` - Allow images from same origin, data URIs, and HTTPS sources
- **Cross-Origin-Resource-Policy: cross-origin** - Configured to allow API access from different origins
- **X-Powered-By** - Header removed to avoid revealing technology stack

### Request Limits

- **Maximum request body size:** 10KB
- Applies to both JSON (`application/json`) and URL-encoded (`application/x-www-form-urlencoded`) requests
- Requests exceeding this limit will receive `413 Payload Too Large` status code

### HTTPS Enforcement

- **Production environment only:** HTTP requests are automatically redirected to HTTPS
- **Redirect type:** 301 Permanent Redirect
- **Detection method:** Uses `x-forwarded-proto` header (compatible with most reverse proxies and load balancers)

### Security Benefits

1. **Prevents XSS Attacks** - Content-Security-Policy restricts script execution
2. **Prevents Clickjacking** - X-Frame-Options blocks unauthorized embedding
3. **Prevents MIME Sniffing** - X-Content-Type-Options enforces declared content types
4. **Enforces Encryption** - HTTPS-only in production protects data in transit
5. **Prevents DoS** - Request size limits protect against memory exhaustion
6. **Reduces Attack Surface** - Removed X-Powered-By header hides server technology

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `page` - Page number (min: 1, default: 1)
- `limit` - Items per page (min: 1, max: 100, default: 20)

**Response includes:**
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

## Webhook Events (Future)

Future versions may support webhooks for real-time notifications:

- `draw.completed` - Draw has been executed
- `ticket.won` - Ticket won a prize
- `transaction.confirmed` - TON transaction confirmed

---

## Best Practices

### Authentication
- Store JWT token securely (localStorage, secure cookie)
- Refresh token before expiration
- Handle 401 errors by redirecting to login

### Error Handling
- Always check `success` field in response
- Handle all error status codes appropriately
- Show user-friendly error messages

### TON Transactions
- Wait for transaction confirmation before calling buy-ticket
- Include transaction hash in request
- Handle transaction verification failures gracefully

### Performance
- Use pagination for large data sets
- Cache lottery list and info responses
- Implement request debouncing on frontend

---

## Examples

### Complete Ticket Purchase Flow

```javascript
// 1. Login with Telegram
const loginResponse = await fetch('/api/auth/telegram', {
  method: 'POST',
  body: JSON.stringify(telegramAuthData)
});
const { token } = await loginResponse.json();

// 2. Connect TON Wallet
await fetch('/api/auth/connect-wallet', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    walletAddress: '0QDAy6M4...',
    walletVersion: 'v4'
  })
});

// 3. Get lottery info
const lotteryResponse = await fetch('/api/lottery/weekend-special/info', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const lottery = await lotteryResponse.json();

// 4. Send TON transaction (using TON Connect)
const txHash = await tonConnect.sendTransaction({
  to: lotteryWallet,
  value: lottery.lottery.ticketPrice
});

// 5. Buy ticket
const ticketResponse = await fetch('/api/lottery/weekend-special/buy-ticket', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    numbers: [5, 12, 23, 31, 36],
    transactionHash: txHash
  })
});
const ticket = await ticketResponse.json();
```

---

For more information, see [README.md](./README.md) and [SECURITY.md](./SECURITY.md).
