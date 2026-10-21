# Deploy automatico sul VPS

Il sito `calendario.effataitalia.it` gira sul VPS (nginx → Express sulla porta 3000, con Docker Compose).
Con il workflow `.github/workflows/deploy-vps.yml`, **ogni unione su `main`** aggiorna il VPS da sola:

1. GitHub si collega al VPS via SSH con una chiave dedicata;
2. nella cartella del sito fa `git fetch` + `git merge --ff-only origin/main`;
3. riavvia (`docker compose up -d --build`, oppure il comando in `VPS_RESTART_CMD`);
4. controlla che `http://localhost:3000/api/stats` risponda entro 60 secondi, altrimenti segnala errore e mostra i log.

Si può lanciare anche a mano: GitHub → **Actions → Deploy sul VPS → Run workflow**.

**Sicurezza:** se sul VPS la cartella ha modifiche locali o è su un altro ramo, il `--ff-only` si ferma **senza toccare niente** e il workflow risulta fallito: va sistemato a mano sul VPS.

---

## Configurazione (una volta sola)

### 1. Sul VPS: chiave dedicata al deploy

Collegati al VPS con l'utente che possiede la cartella del sito e può usare Docker (deve essere nel gruppo `docker`).

```bash
# chiave nuova, senza password, usata solo da GitHub per il deploy
ssh-keygen -t ed25519 -f ~/.ssh/deploy_calendario -N "" -C "github-deploy-calendario"
cat ~/.ssh/deploy_calendario.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# questa è la chiave PRIVATA da copiare in GitHub (poi cancellala dal VPS)
cat ~/.ssh/deploy_calendario
rm ~/.ssh/deploy_calendario

# impronta del server, per VPS_KNOWN_HOSTS (facoltativo ma consigliato)
ssh-keyscan -H localhost 2>/dev/null | sed "s/^[^ ]*/$(hostname -I | awk '{print $1}')/"
```

> La chiave privata non va mai incollata in chat, email o file del repository: solo nei segreti di GitHub.

Controlla anche che, nella cartella del sito sul VPS, `git fetch origin main` funzioni senza chiedere password
(il repository è pubblico, quindi basta che `origin` sia l'indirizzo `https://github.com/pimpy67/calendario-solidale-uganda.git`):

```bash
cd /percorso/del/sito
git remote -v
git fetch origin main
```

### 2. Su GitHub: segreti

Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Segreto | Obbligatorio | Esempio |
|---|---|---|
| `VPS_HOST` | sì | indirizzo IP o nome del VPS |
| `VPS_USER` | sì | utente SSH del VPS |
| `VPS_SSH_KEY` | sì | tutto il contenuto della chiave privata, righe `-----BEGIN…` ed `-----END…` comprese |
| `VPS_APP_DIR` | sì | percorso della cartella del sito sul VPS, es. `/home/effata/calendario-solidale-uganda` |
| `VPS_PORT` | no | porta SSH se non è 22 |
| `VPS_KNOWN_HOSTS` | no | riga dell'impronta del server (vedi sopra): impedisce di collegarsi a un server falso |
| `VPS_RESTART_CMD` | no | se il sito **non** usa Docker Compose, es. `pm2 restart calendario` |

### 3. Prova

GitHub → **Actions → Deploy sul VPS → Run workflow**. Nel log devono comparire
`Versione prima` / `Versione dopo` e alla fine `Il sito risponde.`

Poi dal browser: `https://calendario.effataitalia.it/api/natale/stato` deve rispondere con `{"vendita_attiva":…}`.

---

## Revocare l'accesso

Basta togliere la riga `github-deploy-calendario` da `~/.ssh/authorized_keys` sul VPS e cancellare il segreto `VPS_SSH_KEY` su GitHub.
