# Operational Runbook

## Overview
This runbook provides step-by-step procedures for operational tasks, emergency responses, and database restore operations for the lottery-backend application.

## Table of Contents
- [Database Restore Procedures](#database-restore-procedures)
- [Emergency Response Procedures](#emergency-response-procedures)
- [System Health Monitoring](#system-health-monitoring)
- [Important Links](#important-links)

---

## Database Restore Procedures

### Prerequisites
- PostgreSQL client installed (`psql`)
- Access to GitHub repository releases
- Production database credentials
- **IMPORTANT**: Only perform restore operations on staging/test environments unless it's a critical production emergency

### Restore from Backup (Staging/Test Environment)

#### Step 1: Download the Latest Backup
```bash
# Option A: Download manually from GitHub Releases
# Go to: https://github.com/Gor93rus/lottery-backend/releases
# Download the latest backup-YYYYMMDD_HHMMSS release

# Option B: Download via CLI
BACKUP_TAG="backup-20260212_030000"  # Replace with actual tag
curl -L -o backup.sql.gz \
  "https://github.com/Gor93rus/lottery-backend/releases/download/${BACKUP_TAG}/backup_${BACKUP_TAG#backup-}.sql.gz"
```

#### Step 2: Extract the Backup
```bash
gunzip backup.sql.gz
```

#### Step 3: Verify Backup Integrity
```bash
# Check file size (should not be empty)
ls -lh backup.sql

# Inspect first and last lines
head -20 backup.sql
tail -20 backup.sql

# Verify SQL syntax (optional but recommended)
grep -i "error" backup.sql || echo "No errors found in backup file"
```

#### Step 4: Restore to Staging Database
```bash
# Set staging database URL
export STAGING_DATABASE_URL='postgresql://user:password@staging-host:5432/staging_db'

# CRITICAL: Verify this is NOT production
echo $STAGING_DATABASE_URL | grep -i "prod" && echo "⚠️ WARNING: Production detected!" || echo "✅ Safe to proceed"

# Restore the database
PGSSLMODE=require psql "$STAGING_DATABASE_URL" < backup.sql
```

#### Step 5: Verify Restore Success
```bash
# Check table counts
psql "$STAGING_DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$STAGING_DATABASE_URL" -c "SELECT COUNT(*) FROM tickets;"
psql "$STAGING_DATABASE_URL" -c "SELECT COUNT(*) FROM transactions;"

# Verify recent data
psql "$STAGING_DATABASE_URL" -c "SELECT created_at FROM users ORDER BY created_at DESC LIMIT 5;"
```

---

### Emergency Production Restore

⚠️ **CRITICAL**: Only use in disaster recovery scenarios. This will overwrite production data.

#### Before You Begin
1. **Confirm emergency** - Ensure this is truly necessary
2. **Notify stakeholders** - Alert team members and users
3. **Document the incident** - Record what happened and why restore is needed
4. **Get approval** - Obtain authorization from project owner

#### Emergency Restore Steps

##### 1. Put Application in Maintenance Mode
```bash
# Via Render Dashboard:
# 1. Navigate to: https://dashboard.render.com/web/YOUR_SERVICE_ID
# 2. Go to Settings → Suspend Service
# 3. Confirm suspension

# Alternative: Set environment variable
# MAINTENANCE_MODE=true (if implemented)
```

##### 2. Download Latest Backup
```bash
# Find the most recent backup
# Visit: https://github.com/Gor93rus/lottery-backend/releases

# Download it
BACKUP_TAG="backup-20260212_030000"  # Use actual latest tag
curl -L -o production_backup.sql.gz \
  "https://github.com/Gor93rus/lottery-backend/releases/download/${BACKUP_TAG}/backup_${BACKUP_TAG#backup-}.sql.gz"

gunzip production_backup.sql.gz
```

##### 3. Verify Backup Before Restore
```bash
# CRITICAL: Verify backup integrity
head -50 production_backup.sql
tail -50 production_backup.sql

# Check for expected tables
grep -i "CREATE TABLE" production_backup.sql | wc -l
```

##### 4. Perform Production Restore
```bash
# Set production database URL from Supabase/Render
export DATABASE_URL='postgresql://...'  # Get from Supabase Dashboard

# Restore (this will drop and recreate all tables)
PGSSLMODE=require psql "$DATABASE_URL" < production_backup.sql
```

##### 5. Verify Restore
```bash
# Verify key tables exist and have data
psql "$DATABASE_URL" -c "\dt"  # List tables
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tickets;"
```

##### 6. Resume Application
```bash
# Via Render Dashboard:
# 1. Navigate to your service
# 2. Go to Settings → Resume Service

# Test health endpoint
curl https://your-app.onrender.com/health
```

##### 7. Post-Restore Verification
- Verify user login works
- Check that recent transactions are visible
- Monitor error logs in Sentry
- Test critical API endpoints

---

## Emergency Response Procedures

### Application Down
1. **Check Health Status**
   - Visit: https://your-app.onrender.com/health
   - Check Render Dashboard: https://dashboard.render.com/

2. **Review Error Logs**
   - Render Logs: Dashboard → Your Service → Logs
   - Sentry: https://sentry.io/organizations/your-org/issues/

3. **Common Issues and Solutions**
   - **Database Connection Failed**: Check Supabase status, verify DATABASE_URL
   - **Out of Memory**: Restart service in Render dashboard
   - **Deployment Failed**: Check GitHub Actions logs, rollback if needed

### Database Issues
1. **Connection Timeout**
   - Check Supabase Dashboard: https://app.supabase.com/
   - Verify connection pooling settings
   - Check if connection limit reached

2. **Query Performance**
   - Review slow queries in Supabase logs
   - Check for missing indexes
   - Monitor database CPU/memory usage

### Security Incident
1. **Suspected Breach**
   - Immediately rotate all secrets in GitHub Environment settings
   - Review access logs in Supabase and Render
   - Contact security team (see Emergency Contacts below)

2. **API Abuse**
   - Check rate limiting configuration
   - Review Sentry error patterns
   - Block offending IPs if necessary (via Render or Cloudflare)

---

## System Health Monitoring

### Daily Checks
- [ ] Review Sentry error counts: https://sentry.io/
- [ ] Check Render service health: https://dashboard.render.com/
- [ ] Verify database backup succeeded: GitHub Releases
- [ ] Monitor database size/usage: Supabase Dashboard

### Weekly Checks
- [ ] Review GitHub Actions workflow status
- [ ] Verify database restore test passed (automated via restore-test.yml)
- [ ] Check for Dependabot security alerts
- [ ] Review application metrics and performance trends

### Monthly Checks
- [ ] Audit user access and permissions
- [ ] Review and rotate secrets if needed
- [ ] Check backup retention and cleanup
- [ ] Update dependencies and security patches

---

## Important Links

### Application Infrastructure
- **Production Application**: https://your-app.onrender.com
- **Render Dashboard**: https://dashboard.render.com/
- **Supabase Dashboard**: https://app.supabase.com/

### Monitoring & Logs
- **Sentry (Error Tracking)**: https://sentry.io/
- **GitHub Actions**: https://github.com/Gor93rus/lottery-backend/actions
- **Database Backups**: https://github.com/Gor93rus/lottery-backend/releases?q=backup

### Documentation
- **Deployment Guide**: [DEPLOY.md](../DEPLOY.md)
- **API Documentation**: [API_DOCUMENTATION.md](../API_DOCUMENTATION.md)
- **Security Policy**: [SECURITY.md](../SECURITY.md)

---

## Emergency Contacts

### Primary Contacts
- **Project Owner**: @Gor93rus
- **Repository**: https://github.com/Gor93rus/lottery-backend

### Support Channels
- **GitHub Issues**: https://github.com/Gor93rus/lottery-backend/issues
- **For urgent production issues**: Create issue with `production` and `urgent` labels

### Escalation Path
1. Check this runbook for standard procedures
2. Review relevant documentation (DEPLOY.md, SECURITY.md)
3. Search existing GitHub issues
4. Create new issue if problem persists
5. Contact project owner directly for critical emergencies

---

## Revision History
- **2026-02-12**: Initial runbook created
- Add updates here when procedures change

---

## Notes
- Always test restore procedures in staging before attempting production restore
- Keep this document updated as infrastructure evolves
- Document any incidents and their resolutions
- Regular restore testing ensures backups are valid and procedures work
