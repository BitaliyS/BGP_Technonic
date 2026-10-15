# Деплой на app.legaltech-radar.tech

DNS: `A app → 187.77.67.227` (уже есть).

## Важно про 80/443

На сервере уже крутятся Traefik и `legaltech-radar-edge`.  
Caddy в `docker-compose.prod.yml` тоже хочет **80/443** для Let's Encrypt.

Перед `up` на сервере:

```bash
ss -tlnp | grep -E ':80|:443'
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '80|443|traefik|edge'
```

- Если порты заняты Traefik — либо временно остановить edge/traefik для этого хоста, либо вместо Caddy повесить маршрут Traefik на `app.legaltech-radar.tech` → `frontend:3000` и `/api` → `backend:8000`.
- Если 80/443 свободны — Caddy сам выпустит сертификат при первом старте.

## С гита на сервер

```bash
ssh root@187.77.67.227
cd /opt
git clone <URL_РЕПО> technonicol-ai
cd technonicol-ai
cp deploy/.env.prod.example .env.prod
nano .env.prod   # пароль БД, JWT_SECRET, ключи LLM

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy
```

В логах Caddy должны появиться строки про получение сертификата для `app.legaltech-radar.tech`.

Проверка:

```bash
curl -I https://app.legaltech-radar.tech
curl -s https://app.legaltech-radar.tech/api/auth/me   # 401 без токена — ок
```

Вход: `A_Shorin` / `BGP_Nicol_legaltech`
