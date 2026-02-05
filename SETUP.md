# Calendario Solidale - Guida Setup

## Prerequisiti
- Node.js 18+ installato
- Account Railway (gratuito)
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

## Deploy su Railway

### 1. Crea account Railway
Vai su https://railway.app e registrati (puoi usare GitHub)

### 2. Nuovo progetto
1. Click "New Project"
2. Seleziona "Deploy from GitHub repo" o "Empty Project"
3. Se hai il codice su GitHub, collegalo
4. Altrimenti usa Railway CLI:

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 3. Configura variabili ambiente
Nel pannello Railway, vai in "Variables" e aggiungi:
- `ADMIN_PASSWORD`: la tua password admin sicura
- `BASE_URL`: l'URL che Railway ti assegna (es. https://tuo-progetto.up.railway.app)
- `SATISPAY_API_KEY`: (quando avrai le credenziali Satispay)
- `SATISPAY_SANDBOX`: true (per test) o false (produzione)

### 4. Verifica
Dopo il deploy, visita l'URL assegnato da Railway.

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
https://tuo-progetto.up.railway.app/api/webhook/satispay
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
├── railway.json         # Config Railway
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
1. Verifica i log di Railway
2. Controlla la console del browser per errori JavaScript
3. Verifica le variabili ambiente siano impostate correttamente
