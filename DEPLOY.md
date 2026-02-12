# Deployment Runbook

## Overview
This document outlines the complete deployment process for the lottery-backend application, including environment setup, security configuration, and operational procedures.

## Table of Contents
- [Prerequisites](#prerequisites)
- [GitHub Environment Setup](#github-environment-setup)
- [Branch Protection Rules](#branch-protection-rules)
- [Deployment Workflows](#deployment-workflows)
- [Production Deployment](#production-deployment)
- [Staging Deployment](#staging-deployment)
- [Rollback Procedure](#rollback-procedure)
- [Database Backup & Restore](#database-backup--restore)
- [Troubleshooting](#troubleshooting)

## Prerequisites
- GitHub repository access with appropriate permissions
- Access to production database (Supabase or similar)
- Render.com account (for deployment) or alternative hosting platform
- Node.js 20+ and npm installed locally
- PostgreSQL client (`psql`) for database operations

## GitHub Environment Setup

### Creating Production Environment

1. **Navigate to Repository Settings**
   - Go to your repository on GitHub
   - Click **Settings** → **Environments**
   - Click **New environment**

2. **Configure Production Environment**
   - Name: `production`
   - Click **Configure environment**

3. **Set up Environment Protection Rules**
   - ✅ **Required reviewers**: Add at least one reviewer (e.g., @Gor93rus)
   - ✅ **Wait timer**: Optional, set to 0 for immediate deployment after approval
   - ✅ **Deployment branches**: Select "Selected branches" and add `main`

4. **Add Environment Secrets**
   
   Click **Add secret** for each of the following:

   | Secret Name | Description | Example/Format |
   |------------|-------------|----------------|
   | `DATABASE_URL` | Production database connection string (direct connection) | `postgresql://user:pass@host:5432/db?sslmode=require` |
   | `RENDER_API_KEY` | Render.com API key for automatic deployments | Get from https://dashboard.render.com/account/api-keys |
   | `RENDER_SERVICE_ID` | Render service ID | Found in your service dashboard URL |
   | `PRODUCTION_URL` | Full URL of production application | `https://your-app.onrender.com` |
   | `JWT_SECRET` | JWT signing secret | Generate: `openssl rand -base64 32` |
   | `TON_WALLET_MNEMONIC` | TON wallet mnemonic (24 words) | `word1 word2 ... word24` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (if using Supabase) | `eyJ...` from Supabase dashboard |
   | `ENCRYPTION_KEY` | Data encryption key | Generate: `openssl rand -base64 32` |
   | `SENTRY_DSN` | Sentry error tracking DSN (optional) | `https://...@sentry.io/...` |

### Creating Staging Environment (Optional)

1. **Create Staging Environment**
   - Name: `staging`
   - No required reviewers needed for staging

2. **Add Staging Environment Secrets**
   
   | Secret Name | Description |
   |------------|-------------|
   | `STAGING_DATABASE_URL` | Staging database connection string |
   | `STAGING_URL` | Staging application URL |
   | `STAGING_DEPLOY_HOOK` | Staging deployment webhook (or use Render keys) |
   | `RENDER_STAGING_API_KEY` | Render API key for staging |
   | `RENDER_STAGING_SERVICE_ID` | Render staging service ID |

## Branch Protection Rules

### Setting up Main Branch Protection

1. **Navigate to Branch Settings**
   - Go to **Settings** → **Branches**
   - Click **Add branch protection rule**

2. **Configure Protection Rules**
   - Branch name pattern: `main`
   
   Enable the following rules:
   
   - ✅ **Require a pull request before merging**
     - Required approvals: `1` (minimum)
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - Required status checks:
       - `lint-typecheck-build`
       - `security-audit`
   
   - ✅ **Require conversation resolution before merging**
   
   - ✅ **Do not allow bypassing the above settings**
     - ⚠️ **Include administrators**: Enable this to enforce rules for all users including admins

3. **Save Changes**
   - Click **Create** or **Save changes**

### Development Branch (Optional)

For `develop` or `staging` branch:
- Similar protection rules but with relaxed requirements
- May allow direct pushes for rapid iteration
- Still require CI checks to pass

## Deployment Workflows

### Available Workflows

1. **Database Backup** (`.github/workflows/database-backup.yml`)
   - Runs daily at 03:00 UTC
   - Can be triggered manually
   - Creates compressed backups in GitHub Releases
   - Auto-cleanup after 14 days

2. **Production Deployment** (`.github/workflows/deploy-prod.yml`)
   - Manual trigger or tag-based (`release-*`)
   - Requires production environment approval
   - Includes backup verification, migrations, build, deploy, smoke tests

3. **Staging Deployment** (`.github/workflows/deploy-staging.yml`)
   - Auto-triggers on push to `develop` or `staging` branch
   - No approval required
   - For testing and validation

## Production Deployment

### Pre-Deployment Checklist

- [ ] All tests passing on `main` branch
- [ ] Code review completed and approved
- [ ] Recent database backup exists (< 24 hours)
- [ ] Changelog updated with version changes
- [ ] Production environment secrets configured

### Deployment Process

#### Option 1: Manual Trigger (Recommended)

1. **Navigate to Actions**
   - Go to **Actions** → **Deploy to Production**
   - Click **Run workflow**

2. **Configure Workflow**
   - Branch: `main`
   - Skip backup check: Leave unchecked (recommended)
   - Click **Run workflow**

3. **Approve Deployment**
   - Workflow will wait for approval (if required reviewers configured)
   - Review deployment details
   - Click **Review deployments** → **Approve and deploy**

4. **Monitor Deployment**
   - Watch workflow logs for progress
   - Verify each step completes successfully
   - Check smoke tests pass

#### Option 2: Tag-based Deployment

```bash
# Create a release tag
git tag -a release-1.0.0 -m "Release version 1.0.0"
git push origin release-1.0.0
```

This will automatically trigger the production deployment workflow.

### Post-Deployment Verification

1. **Check Application Health**
   ```bash
   curl https://your-app.onrender.com/health
   ```

2. **Verify API Endpoints**
   - Test critical endpoints
   - Check authentication flow
   - Verify database connectivity

3. **Monitor Logs**
   - Check Render dashboard for logs
   - Look for errors or warnings
   - Verify Sentry (if configured)

4. **Test Key Features**
   - User authentication
   - Lottery operations
   - TON wallet integration

## Staging Deployment

Staging deployments happen automatically on push to `develop` or `staging` branch:

```bash
git checkout develop
git merge feature-branch
git push origin develop
```

The staging workflow will:
1. Install dependencies
2. Run migrations on staging database
3. Build application
4. Deploy to staging environment
5. Run smoke tests

## Rollback Procedure

### Quick Rollback (Render)

If using Render.com:

1. **Via Render Dashboard**
   - Go to your service dashboard
   - Click **Manual Deploy**
   - Select a previous commit
   - Click **Deploy**

2. **Via API**
   ```bash
   # Find previous successful commit
   git log --oneline -10
   
   # Deploy specific commit
   COMMIT_SHA="abc1234"
   ./scripts/deploy_to_render.sh
   ```

### Database Rollback

⚠️ **WARNING**: Database rollbacks are complex and risky. Always prefer forward fixes.

If database rollback is absolutely necessary:

1. **Stop Application**
   - Prevent new database writes
   - Put application in maintenance mode

2. **Restore from Backup**
   ```bash
   # Download backup from GitHub Releases
   # Restore to production (USE WITH EXTREME CAUTION)
   # See "Database Backup & Restore" section
   ```

3. **Rollback Code**
   - Deploy previous stable version
   - Verify application starts successfully

4. **Test Thoroughly**
   - Verify data integrity
   - Test critical paths
   - Monitor for errors

## Database Backup & Restore

### Automatic Backups

Backups run daily at 03:00 UTC via GitHub Actions:
- Stored in GitHub Releases with tag `backup-YYYYMMDD_HHMMSS`
- Compressed with gzip
- Automatically deleted after 14 days
- Includes cleanup and notifications

### Manual Backup

Trigger backup manually:

1. **Via GitHub Actions**
   - Go to **Actions** → **Database Backup**
   - Click **Run workflow**
   - Set retention days (optional)
   - Click **Run workflow**

2. **Via Script** (local)
   ```bash
   export DATABASE_URL='postgresql://...'
   ./scripts/backup-database.sh ./backups
   ```

### Test Restore (Staging)

Regular testing of backup restore is critical:

```bash
# Set staging database URL
export STAGING_DATABASE_URL='postgresql://user:pass@staging-host:5432/staging_db'

# Optional: GitHub token for authentication
export GITHUB_TOKEN='ghp_...'

# Run test restore
./scripts/db/restore_test.sh
```

The script includes safety checks:
- ✅ Requires `STAGING_DATABASE_URL` (won't use production)
- ✅ Checks for production keywords in URL
- ✅ Requires manual confirmation
- ✅ Downloads latest backup from GitHub Releases
- ✅ Decompresses and restores to staging

**Recommended Schedule**: Test restore weekly or after major schema changes

### Production Restore (Emergency Only)

⚠️ **DANGER**: Only use in emergency situations

```bash
# 1. Download backup from GitHub Releases
curl -L -o backup.sql.gz https://github.com/Gor93rus/lottery-backend/releases/download/backup-YYYYMMDD_HHMMSS/backup_YYYYMMDD_HHMMSS.sql.gz

# 2. Extract
gunzip backup.sql.gz

# 3. Verify backup file
head -20 backup.sql
tail -20 backup.sql

# 4. Stop application to prevent writes
# (Render dashboard → Settings → Suspend)

# 5. Restore
PGSSLMODE=require psql "$DATABASE_URL" < backup.sql

# 6. Verify restore
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"

# 7. Restart application
```

## Troubleshooting

### Deployment Failed: Backup Check

**Error**: "No recent backup found"

**Solution**:
1. Run Database Backup workflow manually
2. Wait for completion
3. Re-run deployment
4. OR use `skip_backup_check=true` (not recommended)

### Deployment Failed: Migration Error

**Error**: Migration failed

**Solution**:
1. Check migration files in `prisma/migrations/`
2. Verify DATABASE_URL is correct
3. Check database logs
4. May need to manually fix migration state:
   ```bash
   npx prisma migrate resolve --applied "migration_name"
   ```

### Deployment Failed: Build Error

**Error**: Build failed

**Solution**:
1. Check TypeScript errors locally: `npm run typecheck`
2. Check for missing dependencies: `npm ci`
3. Review recent code changes
4. Roll back if necessary

### Health Check Failed

**Error**: Smoke tests failed

**Solution**:
1. Check application logs in Render dashboard
2. Verify environment variables are set
3. Check database connectivity
4. Verify all required secrets are configured

### Render API Key Invalid

**Error**: Authentication failed (HTTP 401)

**Solution**:
1. Generate new API key: https://dashboard.render.com/account/api-keys
2. Update `RENDER_API_KEY` in production environment secrets
3. Re-run deployment

## Emergency Contacts

- **Repository Owner**: @Gor93rus
- **DevOps Issues**: Create issue with label `deployment`
- **Production Incidents**: Create issue with label `production` + `bug`

## Additional Resources

- [Render Deployment Guide](https://render.com/docs/deploy-node-express-app)
- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Actions](https://docs.github.com/en/actions)

---

*Last updated: 2026-02-12*