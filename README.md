# Технониколь-ИИ

Прототип сервиса ИИ-проверки договоров для Технониколь.

Концепция продукта: [`TECHNONICOL.md`](TECHNONICOL.md).

## Стек

- Frontend: Next.js 14, TipTap, Tailwind
- Backend: FastAPI, SQLAlchemy, SQLite (локально) / PostgreSQL (Docker)
- Агент: Hermes-оркестратор + скиллы документов

## Быстрый старт (локально)

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (другой терминал)
cd frontend
npm install
npm run dev
```

Открыть http://localhost:3000

### Вход

| Логин | Пароль |
|-------|--------|
| A_Shorin | BGP_Nicol_legaltech |

## Docker

```bash
docker compose up --build
```

## Разделы

| Раздел | Кто | Что |
|--------|-----|-----|
| **Технониколь-ИИ** | юрист | проекты, чаты, загрузка, проверка, анонимизация, договор справа |
| **Моя команда** | руководитель | ЛК: статистика ошибок и проверок |
| **Кабинет администратора** | admin | пользователи, версии промптов |
| **Песочница промптов** | admin | тест промпта на образце без боевого дела |

Раскладка кабинета юриста: рейл чатов/документов слева · диалог по центру · договор справа (как в Ur_Agent / НейроЛис).
