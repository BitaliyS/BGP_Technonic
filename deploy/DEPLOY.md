# Деплой на app.legaltech-radar.tech

DNS: `A app → 187.77.67.227` (уже есть).

## 80/443

На сервере **Traefik** слушает `*:80` и `*:443`.  
Прод-compose вешает сервисы на Traefik через labels + сеть `proxy`.  
Сертификат Let's Encrypt выпускает Traefik (`tls.certresolver=le`).

## На сервере (уже под root)

```bash
# 1) имя сети Traefik
docker network ls
docker inspect traefik-traefik-1 --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool | head -40

# если сеть не называется proxy — подставь имя в .env.prod:
# TRAEFIK_NETWORK=имя_сети

# 2) клон
cd /opt
git clone https://origin.cursor.com/specsavi/technonicol-ai.git
cd technonicol-ai
cp deploy/.env.prod.example .env.prod
nano .env.prod

# 3) поднять
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4) сертификат / роуты
docker logs traefik-traefik-1 2>&1 | grep -i 'app.legaltech-radar\|certificate\|ACME' | tail -30
curl -I https://app.legaltech-radar.tech
curl -s -o /dev/null -w '%{http_code}\n' https://app.legaltech-radar.tech/api/health
```

Вход: `A_Shorin` / `BGP_Nicol_legaltech`
