# Deployment Runbook

## Overview
This document outlines the steps to deploy the lottery-backend application.

## Prerequisites
- Ensure all dependencies are installed.
- Make sure the environment variables are configured correctly.

## Deployment Steps
1. Pull the latest changes from the main branch.
2. Run migrations with Prisma.
3. Start the application using Docker.
4. Verify that the application is running correctly by checking the logs.

## Rollback Procedure
If the deployment fails, please follow these steps to rollback:
1. Stop the currently running application.
2. Deploy the last stable version.
3. Verify that the application is back to its stable state.