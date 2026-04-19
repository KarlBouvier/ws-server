# Krypton Studio — `ws-server` (HTTP + WebSocket + PDF)

Serveur Node **long-running** : chat temps réel (WebSocket), API REST PDF (Puppeteer), même port HTTP.

## Arborescence

```
ws-server/
├── index.js                 # Express + http.Server + initWebSocket
├── lib/
│   └── prisma.js            # Client Prisma (schéma krypton-website)
├── routes/
│   └── pdf.js               # POST /api/pdf
├── services/
│   └── pdfService.js        # Puppeteer → buffer PDF
└── websocket/
    └── wsHandler.js         # initWebSocket(server)
```

## Variables d’environnement

Fichier `.env` à la racine de `ws-server` :

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_SECRET` | Même secret que Next.js (JWT WebSocket + alignement auth) |
| `DATABASE_LOCAL_URL` | PostgreSQL (même base que l’app) |
| `WS_PORT` | Port HTTP/WS (défaut **3001**) |
| `PDF_API_KEY` | *(optionnel)* Si défini, header `x-pdf-api-key` requis sur `POST /api/pdf` |

## Lancer

```bash
cd ws-server
npm install
# Prisma client généré dans krypton-website (depuis le dossier krypton-website) :
#   npx prisma generate
node index.js
# ou
npm run dev
```

- Santé : `GET http://localhost:3001/health`
- PDF : `POST http://localhost:3001/api/pdf` — body JSON `{ "html": "<!DOCTYPE html>..." }`

## Côté Next.js (Vercel)

- **WebSocket** : `NEXT_PUBLIC_WS_URL` (ex. `wss://…`) — URL WebSocket vers ce serveur.
- **PDF** : `PDF_SERVICE_URL` = URL **HTTP** de ce service (ex. `https://pdf.votre-domaine.com`), sans `/api/pdf` (le client ajoute le chemin). Optionnel : `PDF_API_KEY` partagé avec `PDF_API_KEY` du ws-server.

## WebSocket — événements

- Client → serveur : `chat_message`, `join_conversation`, `leave_conversation`
- Serveur → client : `chat_message`, `error`

Connexion : `ws://host:port?token=<JWT>` (token depuis `GET /api/chat/ws-token` côté Next.js).
