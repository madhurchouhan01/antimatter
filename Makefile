.PHONY: dev test migrate lint

dev:
	docker compose up --build

test:
	docker compose run --rm api pytest tests/ -v

migrate:
	docker compose run --rm api alembic upgrade head

lint:
	docker compose run --rm api ruff check . && mypy backend/

shell:
	docker compose run --rm api bash
	