#!/bin/bash
set -e

# Extract version from package.json
VERSION=$(grep '"version"' package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[:space:]')
TAG="v$VERSION"

echo "🚀 Preparing release for version $TAG"

# Check if release directory exists
if [ ! -d "release" ]; then
  echo "❌ Error: 'release' directory not found."
  echo "Please run 'bun run release:mac' first to build the DMG."
  exit 1
fi

# Find the DMG file
DMG_FILE=$(find release -name "*.dmg" -maxdepth 1 | head -n 1)

if [ -z "$DMG_FILE" ]; then
  echo "❌ Error: No .dmg file found in the 'release' directory."
  exit 1
fi

echo "📦 Found DMG: $DMG_FILE"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI ('gh') is not installed."
    echo "Please install it with 'brew install gh' and run 'gh auth login'."
    exit 1
fi

# Check if the tag exists, if not, create it
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "🏷️ Creating git tag $TAG..."
  git tag "$TAG"
  git push origin "$TAG"
fi

echo "🚢 Publishing release to GitHub..."
# Create the release and upload the DMG
gh release create "$TAG" "$DMG_FILE" --title "Release $TAG" --generate-notes

echo "✅ Successfully published $TAG and uploaded $DMG_FILE!"
echo "The website download button will now automatically serve this new version."
