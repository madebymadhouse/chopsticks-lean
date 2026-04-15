.PHONY: help start stop restart logs status health test

help:
	@echo "chopsticks-lean"
	@echo "  make start    - start docker compose"
	@echo "  make stop     - stop docker compose"
	@echo "  make restart  - restart docker compose"
	@echo "  make logs     - tail bot logs"
	@echo "  make status   - show compose status"
	@echo "  make health   - curl local health endpoint"
	@echo "  make test     - run lean test suite"

start:
	@docker compose up -d --build

stop:
	@docker compose down

restart: stop start

logs:
	@docker compose logs -f bot

status:
	@docker compose ps

health:
	@curl -s http://127.0.0.1:$${HEALTH_PORT:-9100}/healthz || true

test:
	@npm test
