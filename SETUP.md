# Calendario Solidale - Guida Setup

## Prerequisiti
- Node.js 18+ installato
- Accesso al VPS di produzione (Hostinger), per il deploy: vedi `DEPLOY.md`
- Account Satispay Business (per i pagamenti)

## Setup Locale

### 1. Risolvi permessi npm (se necessario)
Se riscontri errori di permessi, esegui:
```bash
sudo chown -R $(whoami) ~/.npm
```

### 2. Installa dipendenze
```bash
cd "CALENDARIO SOLIDALE"
npm install
```

### 3. Configura variabili ambiente
```bash
cp .env.example .env
# Modifica .env con i tuoi valori
```

### 4. Avvia il server
```bash
npm start
```

### 5. Apri nel browser
- Calendario: http://localhost:3000
- Admin Panel: http://localhost:3000/admin
  - Password default: `admin2026`

---

## Deploy in produzione

Il sito gira su un VPS Hostinger (nginx → Express sulla porta 3000, con Docker Compose).
Il deploy è descritto in `DEPLOY.md`: ogni unione su `main` aggiorna il VPS tramite GitHub Actions.

Le variabili ambiente vanno nel file `.env` sul VPS (modello in `.env.example`), in particolare:
- `ADMIN_PASSWORD`: la tua password admin sicura
- `BASE_URL`: l'indirizzo pubblico del sito (es. https://calendario.effataitalia.it)
- `SATISPAY_API_KEY`: (quando avrai le credenziali Satispay)
- `SATISPAY_SANDBOX`: true (per test) o false (produzione)

### Verifica
Dopo il deploy, `https://<tuo-dominio>/api/stats` deve rispondere con `status: ok`.

---

## Integrazione Satispay

### 1. Crea account Satispay Business
Vai su https://business.satispay.com e registra la tua organizzazione.

### 2. Ottieni API Key
Nel pannello Satispay Business:
1. Vai in "Impostazioni" > "API"
2. Crea una nuova API Key
3. Per test, usa l'ambiente Sandbox

### 3. Configura Webhook
Imposta l'URL webhook nel pannello Satispay:
```
https://<tuo-dominio>/api/webhook/satispay
```

### 4. Test
1. Imposta `SATISPAY_SANDBOX=true` nelle variabili
2. Usa l'app Satispay Sandbox per test
3. Verifica che i pagamenti vengano confermati

---

## Aggiungere le Foto dei Mesi

Sostituisci i file in `public/images/months/`:
- gennaio.jpg
- febbraio.jpg
- marzo.jpg
- aprile.jpg
- maggio.jpg
- giugno.jpg
- luglio.jpg
- agosto.jpg
- settembre.jpg
- ottobre.jpg
- novembre.jpg
- dicembre.jpg

Dimensioni consigliate: 1920x1080 pixel (formato 16:9)

---

## Struttura Progetto

```
CALENDARIO SOLIDALE/
├── public/              # Frontend statico
│   ├── index.html       # Pagina calendario
│   ├── css/style.css    # Stili
│   ├── js/              # JavaScript frontend
│   └── images/          # Immagini
├── server/              # Backend Node.js
│   ├── server.js        # Entry point
│   ├── routes/          # API endpoints
│   └── database/        # SQLite
├── admin/               # Pannello admin
├── package.json         # Dipendenze
├── Dockerfile           # Immagine Docker (deploy VPS)
└── .env.example         # Template variabili
```

---

## Condivisione Social

L'app include gia i bottoni per condividere su:
- WhatsApp
- Facebook
- Instagram (copia link)

Per migliorare la preview sui social, modifica i meta tag in `public/index.html`:
- `og:image`: URL immagine di anteprima
- `og:description`: Descrizione per la condivisione

---

## Supporto

Per problemi o domande:
1. Verifica i log del container sul VPS (`docker compose logs`)
2. Controlla la console del browser per errori JavaScript
3. Verifica le variabili ambiente siano impostate correttamente
