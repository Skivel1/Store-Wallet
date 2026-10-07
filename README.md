# Kiosco de Lealtad (PassKit)

Kiosco web que suma puntos por visita a pases de Apple Wallet vía PassKit.
Escanea con lector físico (kiosco) o con la cámara trasera del celular (botón 📷).

## Uso local
```bash
cp .env.example .env     # y edita PASSKIT_API_TOKEN
npm install
export $(cat .env | xargs) && npm start
```

## Docker
```bash
cp .env.example .env     # y edita PASSKIT_API_TOKEN
docker compose up -d --build
```
Abre http://localhost:3000

## Notas
- La cámara del navegador **requiere HTTPS** (excepto en localhost). Pon el contenedor detrás de un proxy/hosting con HTTPS.
- Nunca subas `.env` ni el token a GitHub.
