#!/bin/bash

# Script to set up Google Cloud service account for GitHub Actions
# This script creates a service account with proper permissions for Cloud Run deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  GitHub Actions Service Account Setup               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Get current GCP project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}✗ No GCP project configured${NC}"
    echo -e "${YELLOW}Run: gcloud config set project YOUR_PROJECT_ID${NC}"
    exit 1
fi

echo -e "${BLUE}→ Project ID: ${PROJECT_ID}${NC}"
echo ""

# Service account details
SA_NAME="github-actions-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="github-actions-key.json"

# Check if service account already exists
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${YELLOW}! Service account already exists: ${SA_EMAIL}${NC}"
    read -p "Do you want to continue and create a new key? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
else
    # Create service account
    echo -e "${BLUE}→ Creating service account...${NC}"
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="GitHub Actions Deployer" \
        --description="Service account for automated deployments from GitHub Actions" \
        --project="$PROJECT_ID"
    echo -e "${GREEN}✓ Service account created${NC}"
    echo ""
fi

# Grant permissions
echo -e "${BLUE}→ Granting permissions...${NC}"
echo ""

ROLES=(
    "roles/run.admin:Cloud Run Admin"
    "roles/artifactregistry.admin:Artifact Registry Admin"
    "roles/storage.admin:Storage Admin"
    "roles/iam.serviceAccountUser:Service Account User"
    "roles/viewer:Viewer"
)

for role_info in "${ROLES[@]}"; do
    role="${role_info%%:*}"
    name="${role_info##*:}"
    
    echo -ne "  ${YELLOW}${name}...${NC} "
    
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="$role" \
        --condition=None \
        --quiet 2>&1 | grep -q "bindings" && echo -e "${GREEN}✓${NC}" || echo -e "${YELLOW}✓ (already set)${NC}"
done

echo ""
echo -e "${GREEN}✓ All permissions configured${NC}"
echo ""

# Create key
echo -e "${BLUE}→ Creating service account key...${NC}"

if [ -f "$KEY_FILE" ]; then
    echo -e "${YELLOW}! Key file already exists: ${KEY_FILE}${NC}"
    read -p "Overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        KEY_FILE="github-actions-key-$(date +%s).json"
        echo -e "${YELLOW}→ Using filename: ${KEY_FILE}${NC}"
    fi
fi

gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL" \
    --project="$PROJECT_ID"

echo -e "${GREEN}✓ Key created: ${KEY_FILE}${NC}"
echo ""

# Display next steps
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Next Steps                                         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}1. Copy the service account key:${NC}"
echo -e "   ${YELLOW}cat ${KEY_FILE}${NC}"
echo ""
echo -e "${GREEN}2. Add to GitHub Secrets:${NC}"
echo -e "   • Go to: GitHub Repository → Settings → Secrets and variables → Actions"
echo -e "   • Click: ${YELLOW}New repository secret${NC}"
echo -e "   • Name: ${YELLOW}GCP_SA_KEY${NC}"
echo -e "   • Value: Paste the entire JSON content from step 1"
echo -e "   • Click: ${YELLOW}Add secret${NC}"
echo ""
echo -e "${GREEN}3. Delete the local key file for security:${NC}"
echo -e "   ${YELLOW}rm ${KEY_FILE}${NC}"
echo ""
echo -e "${GREEN}4. Test the deployment:${NC}"
echo -e "   • Push to main branch, or"
echo -e "   • Go to Actions tab → Deploy to Google Cloud Run → Run workflow"
echo ""
echo -e "${RED}⚠ IMPORTANT: Keep the key secure! Anyone with this key can deploy to your project.${NC}"
echo ""

# Option to display key
read -p "Display the key now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    cat "$KEY_FILE"
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${RED}⚠ Remember to delete this file after copying to GitHub!${NC}"
    echo -e "   ${YELLOW}rm ${KEY_FILE}${NC}"
    echo ""
fi
