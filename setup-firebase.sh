#!/bin/bash
set -e

echo "=== Park Finder Firebase Setup ==="
echo ""

# Step 1: Login
echo "Step 1: Logging into Firebase..."
firebase login
echo ""

# Step 2: Create project
PROJECT_ID="park-finder-$(openssl rand -hex 4)"
echo "Step 2: Creating Firebase project: $PROJECT_ID"
firebase projects:create "$PROJECT_ID" --display-name "Park Finder"
echo ""

# Step 3: Set active project
echo "Step 3: Setting active project..."
firebase use "$PROJECT_ID"
echo ""

# Step 4: Enable Firestore
echo "Step 4: Creating Firestore database..."
gcloud firestore databases create --project="$PROJECT_ID" --location=nam5 2>/dev/null || \
  firebase firestore:databases:create --project="$PROJECT_ID" --location=nam5 2>/dev/null || \
  echo "  -> Enable Firestore manually at: https://console.firebase.google.com/project/$PROJECT_ID/firestore"
echo ""

# Step 5: Deploy Firestore rules
echo "Step 5: Deploying Firestore security rules..."
firebase deploy --only firestore:rules --project="$PROJECT_ID" || \
  echo "  -> Deploy rules manually after enabling Firestore"
echo ""

# Step 6: Enable Auth providers
echo "Step 6: Authentication setup..."
echo "  You need to manually enable these providers at:"
echo "  https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers"
echo ""
echo "  1. Apple - Click 'Add new provider' > Apple"
echo "  2. Google - Click 'Add new provider' > Google"
echo ""

# Step 7: Get web app config
echo "Step 7: Creating web app and getting config..."
firebase apps:create WEB "Park Finder" --project="$PROJECT_ID"
echo ""
echo "Getting config values..."
CONFIG=$(firebase apps:sdkconfig WEB --project="$PROJECT_ID" 2>/dev/null)
echo "$CONFIG"
echo ""

# Step 8: Extract and write firebaseConfig.ts
echo "Step 8: Writing firebaseConfig.ts..."
API_KEY=$(echo "$CONFIG" | grep -o '"apiKey": "[^"]*"' | cut -d'"' -f4)
AUTH_DOMAIN=$(echo "$CONFIG" | grep -o '"authDomain": "[^"]*"' | cut -d'"' -f4)
PROJECT=$(echo "$CONFIG" | grep -o '"projectId": "[^"]*"' | cut -d'"' -f4)
STORAGE=$(echo "$CONFIG" | grep -o '"storageBucket": "[^"]*"' | cut -d'"' -f4)
MESSAGING=$(echo "$CONFIG" | grep -o '"messagingSenderId": "[^"]*"' | cut -d'"' -f4)
APP_ID=$(echo "$CONFIG" | grep -o '"appId": "[^"]*"' | cut -d'"' -f4)

if [ -n "$API_KEY" ]; then
  cat > firebaseConfig.ts << TSEOF
export const firebaseConfig = {
  apiKey: "$API_KEY",
  authDomain: "$AUTH_DOMAIN",
  projectId: "$PROJECT",
  storageBucket: "$STORAGE",
  messagingSenderId: "$MESSAGING",
  appId: "$APP_ID",
};
TSEOF
  echo "  -> firebaseConfig.ts written successfully!"
else
  echo "  -> Could not extract config. Get it manually from:"
  echo "     https://console.firebase.google.com/project/$PROJECT_ID/settings/general"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Project ID: $PROJECT_ID"
echo "Console:    https://console.firebase.google.com/project/$PROJECT_ID"
echo ""
echo "Remaining manual steps:"
echo "  1. Enable Apple & Google auth providers (link above)"
echo "  2. Create Google OAuth iOS Client ID at https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "  3. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID to .env"
echo ""
