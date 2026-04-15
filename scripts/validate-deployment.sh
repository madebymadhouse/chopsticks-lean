#!/bin/bash
# Pre-deployment validation script

set -e

echo "===================================="
echo "chopsticks-lean pre-deploy validation"
echo "===================================="
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Check 1: Node.js syntax
echo "🔍 Checking JavaScript syntax..."
node --check src/index.js 2>&1 || { echo -e "${RED}✗ index.js has syntax errors${NC}"; ERRORS=$((ERRORS+1)); }
node --check src/commands/voice.js 2>&1 || { echo -e "${RED}✗ voice.js has syntax errors${NC}"; ERRORS=$((ERRORS+1)); }
node --check src/events/voiceStateUpdate.js 2>&1 || { echo -e "${RED}✗ voiceStateUpdate.js has syntax errors${NC}"; ERRORS=$((ERRORS+1)); }

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ All syntax checks passed${NC}"
fi

# Check 2: .env file
echo
echo "🔍 Checking .env configuration..."
if [ ! -f .env ]; then
  echo -e "${RED}✗ .env file not found${NC}"
  ERRORS=$((ERRORS+1))
else
  # Check required variables
  source .env 2>/dev/null || true
  
  if [ -z "$DISCORD_TOKEN" ]; then
    echo -e "${RED}✗ DISCORD_TOKEN not set${NC}"
    ERRORS=$((ERRORS+1))
  fi
  
  if [ -z "$POSTGRES_URL" ] && [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠ No database connection string found (set POSTGRES_URL or DATABASE_URL)${NC}"
    WARNINGS=$((WARNINGS+1))
  fi
  
  if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ .env configuration looks good${NC}"
  elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}✓ .env has warnings but can proceed${NC}"
  fi
fi

# Check 3: Docker
echo
echo "🔍 Checking Docker..."
if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ Docker not installed${NC}"
  ERRORS=$((ERRORS+1))
else
  echo -e "${GREEN}✓ Docker installed: $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
  
  if ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not available${NC}"
    ERRORS=$((ERRORS+1))
  else
    echo -e "${GREEN}✓ Docker Compose available${NC}"
  fi
fi

# Check 4: Port availability
echo
echo "🔍 Checking port availability..."
if command -v nc &> /dev/null; then
  for PORT in 5432 6379 8080; do
    if nc -z localhost $PORT 2>/dev/null; then
      echo -e "${YELLOW}⚠ Port $PORT already in use${NC}"
      WARNINGS=$((WARNINGS+1))
    fi
  done
  if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All required ports available${NC}"
  fi
else
  echo -e "${YELLOW}⚠ nc not installed, skipping port check${NC}"
  WARNINGS=$((WARNINGS+1))
fi

# Check 5: File permissions
echo
echo "🔍 Checking file permissions..."
if [ ! -r package.json ]; then
  echo -e "${RED}✗ Cannot read package.json${NC}"
  ERRORS=$((ERRORS+1))
fi

if [ ! -x scripts/stack-up.sh ]; then
  echo -e "${YELLOW}⚠ stack-up.sh not executable${NC}"
  chmod +x scripts/stack-up.sh 2>/dev/null || WARNINGS=$((WARNINGS+1))
fi

# Check 6: Dependencies
echo
echo "🔍 Checking dependencies..."
if [ ! -d node_modules ]; then
  echo -e "${YELLOW}⚠ node_modules not found - run 'npm install'${NC}"
  WARNINGS=$((WARNINGS+1))
else
  echo -e "${GREEN}✓ node_modules exists${NC}"
fi

# Check 7: Database connectivity
echo
echo "🔍 Checking database connectivity..."
if [ -f .env ]; then
  source .env 2>/dev/null || true
  if [ "$STORAGE_DRIVER" = "postgres" ] && [ -n "$DATABASE_URL" ]; then
    if command -v docker &> /dev/null && docker compose ps postgres 2>/dev/null | grep -q "Up"; then
      echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
    else
      echo -e "${YELLOW}⚠ PostgreSQL not running, skipping database check${NC}"
      WARNINGS=$((WARNINGS+1))
    fi
  fi
fi

# Summary
echo
echo "===================================="
echo "Validation Summary"
echo "===================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! Ready to deploy.${NC}"
  exit 0
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}⚠ $WARNINGS warning(s) found but can proceed${NC}"
  exit 0
else
  echo -e "${RED}✗ $ERRORS error(s) found. Fix before deploying.${NC}"
  if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) also found${NC}"
  fi
  exit 1
fi
