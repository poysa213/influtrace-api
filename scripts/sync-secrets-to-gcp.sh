#!/bin/bash

# Script to sync environment variables to Google Cloud Secret Manager
# Usage: ./scripts/sync-secrets-to-gcp.sh [--only-new] [--no-confirm] [path-to-env-file]
#   --only-new    Only create secrets that don't exist, skip existing ones
#   --no-confirm  Skip the confirmation prompt (for CI/automation)

# Note: intentionally NOT using set -e because gcloud commands can fail
# for various reasons (already exists, permissions, etc.) and we handle
# them explicitly with if/else blocks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Hardcoded GCP project ID — change this if you migrate to a new project
PROJECT_ID="social-media-analyzer-442313"

# Flags
ONLY_NEW=false
NO_CONFIRM=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --only-new)
            ONLY_NEW=true
            shift
            ;;
        --no-confirm)
            NO_CONFIRM=true
            shift
            ;;
    esac
done

# Default env file
ENV_FILE="${1:-.env.production}"

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  GCP Secret Manager Sync Tool                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ Error: File '$ENV_FILE' not found${NC}"
    echo -e "${YELLOW}Usage: $0 [--only-new] [--no-confirm] [path-to-env-file]${NC}"
    echo -e "${YELLOW}Example: $0 .env.production${NC}"
    exit 1
fi

echo -e "${BLUE}→ Using environment file: ${ENV_FILE}${NC}"
echo ""

echo -e "${YELLOW}⚠ WARNING: This will sync secrets to GCP project:${NC}"
echo -e "${RED}   ${PROJECT_ID}${NC}"
echo ""

if [ "$NO_CONFIRM" = false ]; then
    read -p "Are you sure you want to continue? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Aborted.${NC}"
        exit 0
    fi
fi

echo -e "${BLUE}→ GCP Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}→ Service Account: ${PROJECT_ID}@appspot.gserviceaccount.com${NC}"
echo ""

# Variables that should NOT be stored as secrets (they can be in app.yaml)
SKIP_VARS=(
    "NODE_ENV"
    "PORT"
    "USE_SECRET_MANAGER"
)

# Function to check if variable should be skipped
should_skip() {
    local var_name=$1
    for skip in "${SKIP_VARS[@]}"; do
        if [ "$var_name" = "$skip" ]; then
            return 0
        fi
    done
    return 1
}

# Enable Secret Manager API
echo -e "${YELLOW}→ Enabling Secret Manager API...${NC}"
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID" 2>/dev/null || true
echo ""

# Counters
created=0
updated=0
skipped=0
failed=0
unchanged=0

# Read and process env file
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Processing Secrets                                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
        continue
    fi
    
    # Parse variable name and value
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
        var_name="${BASH_REMATCH[1]}"
        var_value="${BASH_REMATCH[2]}"
        
        # Remove surrounding quotes if present
        var_value="${var_value%\"}"
        var_value="${var_value#\"}"
        var_value="${var_value%\'}"
        var_value="${var_value#\'}"
        
        # Skip if variable should not be a secret
        if should_skip "$var_name"; then
            echo -e "${YELLOW}⊘ Skipping: ${var_name} (not a secret)${NC}"
            ((skipped++))
            continue
        fi
        
        # Skip if value is empty
        if [ -z "$var_value" ]; then
            echo -e "${YELLOW}⊘ Skipping: ${var_name} (empty value)${NC}"
            ((skipped++))
            continue
        fi
        
        # Check if secret exists
        if gcloud secrets describe "$var_name" --project="$PROJECT_ID" --quiet &>/dev/null; then
            if [ "$ONLY_NEW" = true ]; then
                echo -e "${YELLOW}⊘ Skipping: ${var_name} (already exists)${NC}"
                ((skipped++))
                continue
            fi

            # Get current value to compare
            current_value=$(gcloud secrets versions access latest --secret="$var_name" --project="$PROJECT_ID" --quiet 2>/dev/null || true)

            if [ "$current_value" = "$var_value" ]; then
                echo -e "${YELLOW}⊘ Unchanged: ${var_name}${NC}"
                ((unchanged++))
                continue
            fi

            # Update existing secret
            echo -e "${BLUE}↻ Updating: ${var_name}${NC}"
            if echo -n "$var_value" | gcloud secrets versions add "$var_name" \
                --data-file=- \
                --project="$PROJECT_ID" \
                --quiet &>/dev/null; then
                echo -e "${GREEN}✓ Updated: ${var_name}${NC}"
                ((updated++))
            else
                echo -e "${RED}✗ Failed to update: ${var_name}${NC}"
                ((failed++))
            fi
        else
            # Create new secret
            echo -e "${BLUE}+ Creating: ${var_name}${NC}"
            if echo -n "$var_value" | gcloud secrets create "$var_name" \
                --data-file=- \
                --replication-policy="automatic" \
                --project="$PROJECT_ID" \
                --quiet &>/dev/null; then
                
                # Grant Cloud Run service account access (non-fatal)
                gcloud secrets add-iam-policy-binding "$var_name" \
                    --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
                    --role="roles/secretmanager.secretAccessor" \
                    --project="$PROJECT_ID" \
                    --quiet &>/dev/null || true
                
                echo -e "${GREEN}✓ Created: ${var_name}${NC}"
                ((created++))
            else
                echo -e "${RED}✗ Failed to create: ${var_name}${NC}"
                ((failed++))
            fi
        fi
    fi
done < "$ENV_FILE"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Summary                                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Created: ${created}${NC}"
echo -e "${BLUE}↻ Updated: ${updated}${NC}"
echo -e "${YELLOW}⊘ Skipped: ${skipped}${NC}"
if [ $unchanged -gt 0 ]; then
    echo -e "${YELLOW}⊘ Unchanged: ${unchanged}${NC}"
fi
if [ $failed -gt 0 ]; then
    echo -e "${RED}✗ Failed: ${failed}${NC}"
fi
echo ""

if [ $failed -gt 0 ]; then
    echo -e "${RED}⚠ Some secrets failed to sync. Please check the errors above.${NC}"
    exit 1
else
    echo -e "${GREEN}✓ All secrets synced successfully!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Verify secrets: ${YELLOW}gcloud secrets list${NC}"
    echo -e "  2. Deploy your app: ${YELLOW}gcloud run deploy${NC}"
    echo ""
fi
