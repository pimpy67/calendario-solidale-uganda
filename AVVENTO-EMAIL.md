# Email quotidiana del Calendario dell'Avvento

Dal 1° al 25 dicembre 2026, ogni mattina alle 07:00 (Europe/Rome) il server manda alla lista Brevo dell'Avvento l'email del giorno.

## Come funziona

1. **Il cron** (`server/jobs/avventoEmail.js`, avviato da `server/server.js`) scatta alle 07:00 dal 1° al 25 dicembre. Se il server riparte dopo le 07:00 di un giorno dell'Avvento (e prima delle 12:00), recupera l'invio di quel giorno.
2. **Il contenuto** è in `server/email-avvento/`:
   - `indice.json` associa ogni data a oggetto e file (`{ data, oggetto, file }`);
   - `AAAA-MM-GG.html` è l'email del giorno (25 file, dal 1 al 25 dicembre).
3. **La campagna** viene creata su Brevo con:
   - nome `Avvento Effatà · AAAA-MM-GG`;
   - mittente `Effatà Italia ODV <info@effataitalia.it>` (l'unico verificato su Brevo);
   - destinatari: la lista `BREVO_AVVENTO_LIST_ID`;
   - poi viene inviata subito (`sendNow`).
4. **Niente doppi invii:** prima di creare la campagna il job cerca su Brevo una campagna con lo stesso nome. Se esiste ed è già stata inviata, non fa nulla.

### Contenuto di ogni email

- Oggetto, immagine del giorno e testo diversi per ogni giorno.
- Link `https://calendario.effataitalia.it/natale?da=email-GG` (GG = giorno). Apre la pagina dell'Avvento e registra il canale di provenienza.
- Alcuni giorni hanno anche `?disegno=N&da=email-GG`: la pagina apre il modulo con quel disegno già scelto.
- Il link di cancellazione `{{ unsubscribe }}` viene sostituito da Brevo.

Il link non apre la finestra del giorno: `/natale` mostra il calendario secondo la data di oggi (fuso di Roma).

### Iscrizione dalla gift card di Natale

Nel mercatino e nel modulo della gift card c'è una casella facoltativa (non spuntata di default): «voglio ricevere la newsletter e il Calendario dell'Avvento». È separata dal consenso per la consegna della gift card.

- Serve l'email di chi regala: senza email la casella non si può spuntare.
- Il consenso (con la data) viene salvato nella gift card, campo `newsletter_consent_at`.
- Quando la gift card risulta pagata (subito per contanti e POS, dopo il pagamento online o la conferma di bonifico/link dall'admin), l'email viene aggiunta alla lista Brevo dell'Avvento. Se la configurazione Brevo manca o c'è un errore, la vendita va avanti lo stesso e il problema finisce nel log.
- Nessuna doppia conferma (double opt-in): il contatto entra subito.

## Configurazione

Variabili d'ambiente (vedi `.env.example`):

| Variabile | Obbligatoria | Cosa fa |
|---|---|---|
| `AVVENTO_EMAIL_ATTIVA` | sì | `true` accende il cron. Spenta di default. |
| `BREVO_AVVENTO_API_KEY` | sì | Chiave API Brevo, con permessi campagne email e email transazionali. Non usare `BREVO_API_KEY`: sposterebbe su Brevo anche le gift card. |
| `BREVO_AVVENTO_LIST_ID` | sì | Numero della lista iscritti (nel `.env.example`: 2, «Iscritti sito – Newsletter e Calendario»). |
| `AVVENTO_EMAIL_MITTENTE` | no | Mittente diverso da `info@effataitalia.it`, solo se verificato su Brevo. |

## Test

### Prova di una singola email

Manda l'email di un giorno a un indirizzo, come email transazionale. Non tocca la lista. Oggetto con prefisso `[PROVA]`.

```
node server/jobs/avventoEmail.js prova 2026-12-06 indirizzo@email
```

### Prova di tutte le 25 email

Manda le 25 email, una alla volta (pausa di 1,5 secondi), allo stesso indirizzo. Non tocca la lista.

```
node server/jobs/avventoEmail.js prova-tutte indirizzo@email
```

Stampa un esito per ogni giorno. Richiede `BREVO_AVVENTO_API_KEY` nel `.env`.

### Controllo offline (senza invio)

Verifica che per ogni giorno esistano il file, il link `da=email-GG`, il link di cancellazione e le immagini in `public/`. Non serve la chiave Brevo:

```
node -e 'const fs=require("fs"),path=require("path");const d="server/email-avvento";for(const v of JSON.parse(fs.readFileSync(path.join(d,"indice.json"),"utf8"))){const h=fs.readFileSync(path.join(d,v.file),"utf8");const g=v.data.slice(8);if(!h.includes("{{ unsubscribe }}")||!h.includes(`da=email-${g}`))console.log("problema",v.data)}console.log("controllo completato")'
```

## Prima del live: cosa manca

- [ ] **Chiave Brevo dell'Avvento** (`BREVO_AVVENTO_API_KEY`) nel `.env` del server di produzione.
- [ ] **ID della lista** (`BREVO_AVVENTO_LIST_ID`) verificato su Brevo (Contatti → Liste).
- [ ] **Dominio `effataitalia.it` autenticato su Brevo** (SPF, DKIM) e mittente `info@effataitalia.it` verificato. Dominio, DKIM, mittente e DMARC risultano già a posto.
- [x] **SPF/DKIM/DMARC verificati** (prova del 22 nov 2026, «Mostra originale»): `spf=pass` (dominio di ritorno `gt.d.sender-sib.com`), `dkim=pass` (brevo1), `dmarc=pass`. Non serve modificare il record SPF su Hostinger: non aggiungere `include:spf.brevo.com`.
- [x] **Link disiscrizione nella campagna:** verificato con la bozza di test n. 23 (22 nov 2026): il link «Cancella l'iscrizione» apre la pagina di conferma Brevo. Nelle prove transazionali (`avventoEmail.js` riga 139) il link resta `#`: è una limitazione della prova, non dell'invio reale. La riga «Oppure disiscriviti direttamente da Brevo» non è nei nostri file: la aggiunge Brevo alle transazionali.
- [ ] **Promozioni:** 01, 11 e 19 sono finite in Promozioni durante le prove. Dopo lo SPF, rifare una prova. Valutare meno link per mail, più testo accanto alle immagini, e nella prima mail (1° dicembre) chiedere di spostare il messaggio in Principale.
- [ ] **Prova a tutte le 25 email** su un indirizzo reale, controllando su telefono e computer (immagini, link, oggetto, cancellazione).
- [ ] **Iscrizione alla lista:** il form che aggiunge gli iscritti non è nel repository. Va verificato dove si trova e che i contatti finiscano nella lista giusta.
- [ ] **Immagini online:** `https://calendario.effataitalia.it/images/gift_card/web/...` deve rispondere, perché le email le caricano da lì.
- [ ] **Tracciamento per email:** i valori `da=email-01`…`email-25` non sono nella lista chiusa `NATALE_CANALI` (`server/utils/avvento.js`) e finiscono come `altro`. Da sistemare se serve sapere quale email ha portato l'acquisto.
- [ ] **Canale social:** i post sui social devono usare link con `da=fb`, `da=ig` e così via. Il testo del carosello (`facebook-carousel.html`) linka la home senza parametro.
- [ ] **Accensione:** `AVVENTO_EMAIL_ATTIVA=true` solo dopo le prove, e comunque non prima del 1° dicembre.
- [ ] **Server sempre acceso** il 1–25 dicembre: il cron gira nel processo del server. Verificare il deploy (`DEPLOY.md`, `.github/workflows/deploy-vps.yml`) e che `DATABASE_PATH` sia su un percorso persistente.
- [ ] **Log:** dopo l'invio controllare nei log `[Avvento email]` (esito di ogni giorno) e nelle statistiche di Brevo.

## File coinvolti

- `server/jobs/avventoEmail.js`: cron, invio, prove.
- `server/email-avvento/indice.json` e `AAAA-MM-GG.html`: contenuto.
- `server/utils/avvento.js`: canali del tracciamento (`NATALE_CANALI`).
- `server/server.js`: avvia il job.
- `.env.example`: variabili.
