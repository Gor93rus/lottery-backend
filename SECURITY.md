# Security Considerations

This document outlines security considerations, known limitations, and best practices for the Weekend Special Lottery backend.

## 🔒 Current Security Measures

### Authentication & Authorization

✅ **JWT Authentication**
- JWT tokens for user authentication
- 30-day token expiration
- Secure token signing with secret key
- Protected routes require valid tokens

✅ **Telegram Authentication**
- Users authenticate via Telegram
- Telegram user data validation
- Unique Telegram ID per user
- ✅ **Cryptographic hash verification** - IMPLEMENTED
- ✅ **Auth data timestamp validation** (24 hour expiry)
- ✅ **Timing-safe hash comparison** (prevents timing attacks)

✅ **Wallet Verification**
- TON wallet address validation
- One wallet per user account
- Prevent wallet reuse across accounts

### Database Security

✅ **Prisma ORM**
- Parameterized queries (SQL injection prevention)
- Type-safe database operations
- Input validation at ORM level

✅ **Connection Security**
- Encrypted database connections (SSL/TLS)
- Environment-based credentials
- Connection pooling for performance

### API Security

✅ **CORS Protection**
- Configurable allowed origins
- Credentials support for authenticated requests
- Prevents unauthorized cross-origin access

✅ **Rate Limiting**
- General API limiter: 100 requests per 15 minutes per IP
- Auth endpoints limiter: 5 requests per 15 minutes per IP (strict)
- Ticket purchase limiter: 10 requests per 1 minute per IP
- Admin endpoints limiter: 200 requests per 15 minutes per IP
- Standard rate limit headers included in responses
- Custom error messages for different endpoint categories
- Protection against DDoS and brute-force attacks

✅ **Input Validation**
- Request body validation
- URL parameter validation
- Query parameter sanitization
- Number range validation for lottery picks

✅ **Error Handling**
- Sanitized error messages
- No sensitive data in responses
- Different messages for dev/production

## ⚠️ Known Limitations

### High Priority Issues

✅ **Rate Limiting - IMPLEMENTED**
- **Status:** ✅ Implemented using `express-rate-limit` package
- **Implementation Details:**
  - General API routes: 100 requests per 15 minutes
  - Auth endpoints: 5 requests per 15 minutes (strict)
  - Ticket purchases: 10 requests per minute
  - Admin endpoints: 200 requests per 15 minutes
- **Response Format:** Returns 429 status with retry-after information
- **Headers:** Includes standard RateLimit-* headers

✅ **Telegram Auth Verification - IMPLEMENTED**
- **Status:** ✅ Implemented using HMAC-SHA256 verification
- **Implementation Details:**
  - Hash verification using bot token as secret key
  - Data check string created from sorted auth parameters
  - SHA256 hash of bot token used as HMAC secret
  - Timing-safe comparison prevents timing attacks
  - Auth data expires after 24 hours
  - Required in production, optional in development mode
- **Security Features:**
  - Cryptographic verification per Telegram's official spec
  - Prevents authentication bypass attacks
  - Logs failed authentication attempts (no sensitive data)
  - Returns 401 for invalid or expired auth data
  - Returns 500 if bot token not configured in production

❌ **Simplified TON Transaction Verification**
- **Issue:** Transaction verification is placeholder
- **Risk:** Fake transactions could be accepted
- **Mitigation:** Implement full blockchain verification
- **Recommendation:** Query TON API to verify transactions
- **Status:** ✅ IMPLEMENTED - Real blockchain verification using TON Center API

**Implementation Details:**
- Real transaction fetching from TON blockchain via TON Center API
- Verification includes:
  - ✅ Transaction exists and is confirmed on blockchain
  - ✅ Amount verification with tolerance for network fees
  - ✅ Sender address verification
  - ✅ Recipient verification (must be lottery wallet)
  - ✅ Timestamp verification (transaction must be within 1 hour)
  - ✅ Double-spend prevention via database check
- Retry logic with exponential backoff for network resilience
- Supports both testnet and mainnet configurations

### Medium Priority Issues

✅ **Security Headers - IMPLEMENTED**
- **Status:** ✅ Implemented using `helmet` package
- **Implementation Details:**
  - Content-Security-Policy with safe directives
  - X-Content-Type-Options: nosniff (prevents MIME sniffing)
  - X-Frame-Options: SAMEORIGIN (prevents clickjacking)
  - Strict-Transport-Security (HSTS) in production
  - Cross-Origin policies configured for API and TON Connect compatibility
- **Configuration:** CSP allows self, unsafe-inline styles, and cross-origin images

✅ **Request Body Size Limits - IMPLEMENTED**
- **Status:** ✅ Implemented using express middleware
- **Limit:** 10KB for both JSON and URL-encoded bodies
- **Response:** Returns 413 Payload Too Large for oversized requests
- **Protection:** Prevents memory exhaustion and DoS attacks

### Error Tracking

✅ **Sentry Integration**
- Real-time error monitoring
- Sensitive data filtering (tokens, hashes redacted)
- Environment-based sampling
- User context tracking (without PII)

✅ **HTTPS Enforcement - IMPLEMENTED**
- **Status:** ✅ Implemented for production environment
- **Behavior:** Automatically redirects HTTP to HTTPS in production
- **Method:** 301 permanent redirect using x-forwarded-proto header
- **Environment:** Only active when NODE_ENV=production

⚠️ **Weak JWT Secret Detection**
- **Issue:** Default JWT secret in code
- **Risk:** Token forgery if not changed
- **Mitigation:** Require strong secret in production

```javascript
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
```

### Low Priority Issues

ℹ️ **No Admin Authentication on Backend**
- **Issue:** Admin endpoints not yet implemented
- **Risk:** None currently (no admin endpoints)
- **Future:** Implement admin role checking

ℹ️ **Basic Logging**
- **Issue:** Console logging only
- **Risk:** Hard to track security incidents
- **Future:** Implement structured logging (Winston, Pino)

ℹ️ **No Request Logging**
- **Issue:** No audit trail of API requests
- **Risk:** Hard to investigate incidents
- **Future:** Log all authenticated requests

## 🛡️ Best Practices

### Environment Variables

**DO:**
- ✅ Use `.env` file for local development
- ✅ Use environment-specific files (`.env.production`)
- ✅ Store secrets in secure vaults in production
- ✅ Rotate secrets regularly (JWT_SECRET, API keys)
- ✅ Use strong, random values (32+ characters)

**DON'T:**
- ❌ Commit `.env` files to version control
- ❌ Use default/example secrets in production
- ❌ Share secrets via insecure channels
- ❌ Log or expose secrets in responses

### Password & Secret Generation

```bash
# Generate strong JWT secret
openssl rand -base64 32

# Generate UUID for admin users
node -e "console.log(require('crypto').randomUUID())"
```

### Database Security

**DO:**
- ✅ Use connection pooling
- ✅ Enable SSL for database connections
- ✅ Use least privilege database users
- ✅ Regular backups
- ✅ Monitor for suspicious queries

**DON'T:**
- ❌ Use root database user
- ❌ Store plaintext passwords (we don't currently)
- ❌ Allow public database access
- ❌ Skip database migrations

### TON Integration

**DO:**
- ✅ Verify all transactions on-chain
- ✅ Use testnet for development
- ✅ Validate wallet addresses
- ✅ Check transaction confirmations
- ✅ Store transaction hashes for audit

**DON'T:**
- ❌ Trust client-side transaction data
- ❌ Skip transaction verification
- ❌ Reuse transaction hashes
- ❌ Process unconfirmed transactions

### API Design

**DO:**
- ✅ Validate all inputs
- ✅ Sanitize outputs
- ✅ Use HTTPS in production
- ✅ Implement rate limiting
- ✅ Return appropriate status codes
- ✅ Log security events

**DON'T:**
- ❌ Expose internal errors to users
- ❌ Return sensitive data in errors
- ❌ Trust user input
- ❌ Allow unlimited requests

## 🚨 Incident Response

### If You Discover a Vulnerability

1. **Do NOT** disclose publicly
2. Document the vulnerability
3. Contact the development team
4. Wait for patch before disclosure

### Security Checklist for Production

- [ ] JWT_SECRET is strong and unique
- [ ] DATABASE_URL uses SSL connection
- [ ] CORS_ORIGINS is properly configured
- [x] Rate limiting is enabled
- [x] HTTPS is enforced
- [x] Telegram auth hash verification is enabled
- [x] TON transaction verification is implemented
- [x] Request size limits are set
- [x] Security headers are configured
- [ ] Error messages don't leak sensitive data
- [ ] Admin Telegram IDs are configured
- [ ] Logging is set up
- [ ] Monitoring is in place
- [ ] Backup system is configured
- [ ] All .env files are excluded from git

## 📝 Security Roadmap

### Short Term (Before Production)
1. ~~Implement rate limiting~~ ✅ **COMPLETED**
2. ~~Complete Telegram auth verification~~ ✅ **COMPLETED**
3. ✅ Implement full TON transaction verification - **COMPLETED**
4. ~~Add request size limits~~ ✅ **COMPLETED**
5. ~~Enforce HTTPS in production~~ ✅ **COMPLETED**
6. ~~Add security headers~~ ✅ **COMPLETED**
7. Add structured logging

### Medium Term
1. Implement admin authentication
2. Add request audit logging
3. Set up monitoring and alerts
4. Implement 2FA for admin users
5. Add IP whitelisting for admin endpoints
6. Implement session management

### Long Term
1. Security audit by third party
2. Penetration testing
3. Bug bounty program
4. Automated security scanning
5. Compliance certifications
6. DDoS protection

## 🔗 Related Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Prisma Security](https://www.prisma.io/docs/concepts/components/prisma-client/deployment#security)
- [TON Security](https://docs.ton.org/develop/security/)
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)

## 📞 Contact

For security concerns, contact the development team immediately.

**DO NOT** create public issues for security vulnerabilities.

---

**Last Updated:** January 2024  
**Review Schedule:** Quarterly
