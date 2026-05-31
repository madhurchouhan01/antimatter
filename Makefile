.PHONY: dev test migrate lint

dev:
	docker compose up --build

test:
	docker compose run --rm api pytest tests/ -v

lint:
	docker compose run --rm api ruff check . && mypy backend/

shell:
	docker compose run --rm api bash
	
migrate:
	docker compose run --rm api alembic upgrade head

migrate-down:
	docker compose run --rm api alembic downgrade -1

migrate-gen:
	docker compose run --rm api alembic revision --autogenerate -m "$(msg)"

migrate-history:
	docker compose run --rm api alembic history --verbose

watch-logs:
	docker compose logs -f api
	
clear-logs:
	docker compose up -d --force-recreate --no-deps api 