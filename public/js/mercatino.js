/**
 * mercatino.js - Vendita delle gift card di Natale al banchetto, con PIN dei volontari.
 * Pagamenti: contanti, QR (carta o Satispay sul telefono del cliente), link "paga dopo",
 * bonifico (promessa), solo quelli attivi sul server.
 * Vetrina: a tablet fermo i disegni scorrono a tutto schermo; un tocco torna alla scelta.
 */
(function () {
    const PIN_KEY = 'mercatinoPin';
    let pin = '';
    let selectedDesign = null;
    let selectedSrc = null;
    let config = { bonifico: false, link: true, scadenza: '20 dicembre' };
    let doorsForVetrina = [];
    let payMethod = null;
    // Come vuole pagare: testo del pulsante di conferma e riga sopra, nel popup di controllo
    const PAY = {
        cash: { label: 'Paga in contanti', confirm: '💶 Ho ricevuto 20 € in contanti' },
        card: { label: 'Paga con carta, dal suo telefono', confirm: '📱 Mostra il QR per pagare con carta' },
        satispay: { label: 'Paga con Satispay, dal suo telefono', confirm: '🟥 Mostra il QR per pagare con Satispay' },
        link: { label: 'Paga dopo: gli arriva il link', confirm: '✉️ Salva e manda il link per pagare' },
        bonifico: { label: 'Bonifico: promessa di pagamento', confirm: '🏦 Salva e mostra IBAN e causale' }
    };

    // Il PIN resta solo per questa scheda del browser (sessionStorage), se disponibile
    function readPin() {
        try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; }
    }
    function savePin(value) {
        try { sessionStorage.setItem(PIN_KEY, value); } catch (e) { /* senza memoria: si richiede di nuovo */ }
    }
    function clearPin() {
        try { sessionStorage.removeItem(PIN_KEY); } catch (e) { /* ignora */ }
    }

    async function api(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', 'X-Mercatino-Pin': pin, ...(options.headers || {}) };
        const response = await fetch(path, { ...options, headers });
        let data = {};
        try { data = await response.json(); } catch (e) { /* risposta vuota */ }
        if (!response.ok) {
            const error = new Error(data.message || 'Errore di connessione');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function showError(id, message) {
        const el = document.getElementById(id);
        el.textContent = message;
        el.hidden = !message;
    }

    // Avviso grande e ben visibile (riquadro rosso pieno), portato in vista e letto dagli screen reader
    function showAlert(id, message) {
        const el = document.getElementById(id);
        el.textContent = message ? `⚠️ ${message}` : '';
        el.hidden = !message;
        if (message) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus({ preventScroll: true });
        }
    }

    // Stessi controlli del server, fatti subito su "Salva" così l'errore si vede sul campo giusto
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function phoneOk(raw) {
        const text = (raw || '').trim();
        if (!text) return true;
        const hasPrefix = /^(\+|00)/.test(text);
        const digits = text.replace(/[\s().-]/g, '').replace(/^(\+|00)/, '');
        const full = !hasPrefix && !digits.startsWith('39') ? `39${digits}` : digits;
        return /^\d{8,15}$/.test(full);
    }
    // Numero per wa.me: solo cifre, con il 39 se manca il prefisso
    function phoneForWa(raw) {
        const text = (raw || '').trim();
        if (!text || !phoneOk(text)) return '';
        const hasPrefix = /^(\+|00)/.test(text);
        const digits = text.replace(/[\s().-]/g, '').replace(/^(\+|00)/, '');
        return !hasPrefix && !digits.startsWith('39') ? `39${digits}` : digits;
    }
    // Codice fiscale: l'ultimo carattere si calcola dagli altri 15 (copia di server/utils/codiceFiscale.js)
    const CF_DISPARI = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
    function cfOk(raw) {
        const cf = (raw || '').replace(/\s/g, '').toUpperCase();
        if (!cf) return true;
        if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
        let sum = 0;
        for (let i = 0; i < 15; i++) sum += i % 2 === 0 ? CF_DISPARI[cf[i]] : (/\d/.test(cf[i]) ? Number(cf[i]) : cf.charCodeAt(i) - 65);
        return String.fromCharCode(65 + (sum % 26)) === cf[15];
    }

    // Errore sul campo: bordo rosso e spiegazione proprio sotto
    function fieldError(id, message) {
        const input = document.getElementById(id);
        const box = document.getElementById(`err-${id}`);
        if (input && input.tagName !== 'FIELDSET') input.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (box) { box.textContent = message ? `⚠️ ${message}` : ''; box.hidden = !message; }
    }
    function clearFieldErrors() {
        document.querySelectorAll('.merc-field-error').forEach(el => { el.textContent = ''; el.hidden = true; });
        document.querySelectorAll('[aria-invalid]').forEach(el => el.setAttribute('aria-invalid', 'false'));
    }
    const val = (id) => document.getElementById(id).value.trim();
    const checked = (id) => document.getElementById(id).checked;

    // Tutti i dati della vendita, come li vuole il server
    function saleData() {
        return {
            card_design: selectedDesign,
            donor_name: val('donor-name'),
            donor_email: val('donor-email') || null,
            donor_cf: payMethod === 'cash' ? null : (val('donor-cf').replace(/\s/g, '').toUpperCase() || null),
            recipient_name: val('recipient-name'),
            recipient_email: val('recipient-email'),
            recipient_phone: val('recipient-phone'),
            send_email: checked('send-email'),
            send_whatsapp: checked('send-whatsapp'),
            privacy_consent: checked('privacy-consent'),
            message: val('message') || null
        };
    }

    // Disegni del calendario dell'Avvento: davanti (griglia) e retro (carosello sotto).
    // Ogni disegno ha un codice: "porta7" davanti, "porta15r" retro della stessa finestra.
    function makeTile(design, label, thumbSrc, fullSrc, container) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'merc-design';
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', 'false');
        btn.setAttribute('aria-label', label);
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.alt = label;
        img.loading = 'lazy';
        // Sfondo sfocato dello stesso disegno: il riquadro si riempie senza tagliare il disegno
        btn.style.setProperty('--thumb', `url("${thumbSrc}")`);
        btn.appendChild(img);
        btn.addEventListener('click', () => openZoom(design, label, fullSrc, btn));
        container.appendChild(btn);
    }

    // Retro per il mercatino: versione orizzontale se c'è, come le altre
    function retroSrc(door) {
        return door.disegno_retro_mercatino || door.disegno_retro;
    }

    async function loadDesigns() {
        const response = await fetch('/data/avvento.json?v=2026-10-17c');
        const data = await response.json();
        const doors = data.doors || [];
        const grid = document.getElementById('merc-designs');
        const strip = document.getElementById('merc-strip');
        grid.innerHTML = '';
        strip.innerHTML = '';
        doors.filter(d => d.disegno).forEach(door => {
            makeTile(`porta${door.day}`, `Finestra ${door.day}`, door.miniatura || door.disegno, door.disegno, grid);
        });
        doorsForVetrina = doors.filter(d => d.disegno).map(d => d.disegno)
            .concat(doors.filter(d => d.disegno_retro).map(d => retroSrc(d)));
        // Disegni del carosello che non sono su nessuna finestra
        (data.disegni_mercatino || []).forEach(extra => {
            makeTile(extra.code, extra.label, extra.file, extra.file, grid);
        });
        doors.filter(d => d.disegno_retro).forEach(door => {
            makeTile(`porta${door.day}r`, `Finestra ${door.day}, retro`, retroSrc(door), retroSrc(door), strip);
        });
        updateStripArrows();
    }

    // Frecce del carosello dei retro (due righe): ogni freccia sposta di due colonne di disegni
    function scrollStrip(direction) {
        setStripAuto(false);
        const strip = document.getElementById('merc-strip');
        const column = (strip.querySelector('.merc-design')?.offsetWidth || 150) + 8;
        strip.scrollBy({ left: direction * column * 2, behavior: 'smooth' });
    }
    // Scorrimento automatico della striscia: lento, si ferma col tocco, con le frecce o col pulsante
    let stripTimer = null;
    function stripAutoStep() {
        const strip = document.getElementById('merc-strip');
        const column = (strip.querySelector('.merc-design')?.offsetWidth || 150) + 8;
        if (strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 2) strip.scrollTo({ left: 0, behavior: 'smooth' });
        else strip.scrollBy({ left: column, behavior: 'smooth' });
    }
    function setStripAuto(on) {
        clearInterval(stripTimer);
        stripTimer = on ? setInterval(stripAutoStep, 3500) : null;
        const btn = document.getElementById('strip-auto');
        btn.setAttribute('aria-pressed', String(on));
        btn.textContent = on ? '⏸ Ferma lo scorrimento' : '▶ Scorri da solo';
    }
    document.getElementById('strip-auto').addEventListener('click', () => setStripAuto(!stripTimer));
    document.getElementById('merc-strip').addEventListener('pointerdown', () => setStripAuto(false));
    document.getElementById('strip-prev').addEventListener('click', () => scrollStrip(-1));
    document.getElementById('strip-next').addEventListener('click', () => scrollStrip(1));
    // Le frecce restano sempre visibili; si spengono quando non c'è altro da scorrere
    function updateStripArrows() {
        const strip = document.getElementById('merc-strip');
        const maxLeft = strip.scrollWidth - strip.clientWidth;
        document.getElementById('strip-prev').disabled = strip.scrollLeft <= 1;
        document.getElementById('strip-next').disabled = strip.scrollLeft >= maxLeft - 1;
    }
    document.getElementById('merc-strip').addEventListener('scroll', updateStripArrows);
    window.addEventListener('resize', updateStripArrows);

    // Ingrandimento del disegno: si sceglie con il tasto al centro, come nel calendario
    let zoomDesign = null;
    let zoomLabel = null;
    let zoomBtn = null;
    let zoomSrc = null;
    function openZoom(design, label, fullSrc, btn) {
        zoomDesign = design;
        zoomLabel = label;
        zoomBtn = btn;
        zoomSrc = fullSrc;
        const img = document.getElementById('zoom-img');
        img.src = fullSrc;
        img.alt = label;
        document.getElementById('zoom-label').textContent = label;
        document.getElementById('zoom').hidden = false;
        document.getElementById('zoom-choose').focus();
    }
    function closeZoom() {
        document.getElementById('zoom').hidden = true;
    }
    document.getElementById('zoom-choose').addEventListener('click', () => {
        selectDesign(zoomDesign, zoomLabel, zoomBtn, zoomSrc);
        closeZoom();
    });
    document.getElementById('zoom-close').addEventListener('click', closeZoom);
    document.getElementById('zoom').addEventListener('click', (e) => {
        if (e.target.id === 'zoom') closeZoom();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeZoom(); closePayQr(); closePreview(); stopVetrina(); }
    });

    function selectDesign(design, label, btn, src) {
        selectedDesign = design;
        selectedSrc = src;
        document.querySelectorAll('.merc-design').forEach(b => b.setAttribute('aria-checked', 'false'));
        btn.setAttribute('aria-checked', 'true');
        document.getElementById('merc-selected').textContent = label;
    }

    // Popup di controllo: fronte (disegno scelto) e retro con il nome di chi riceve, come nel modulo dell'Avvento
    function openPreview(recipientName) {
        const front = document.getElementById('preview-front');
        front.src = selectedSrc;
        document.getElementById('preview-back-name').textContent = recipientName;
        showAlert('preview-alert', '');
        document.getElementById('preview-paylabel').textContent = PAY[payMethod].label;
        document.getElementById('preview-confirm').textContent = PAY[payMethod].confirm;
        document.getElementById('preview').hidden = false;
        document.getElementById('preview-confirm').focus();
    }
    function closePreview() {
        document.getElementById('preview').hidden = true;
    }

    function formatTime(iso) {
        const date = new Date(iso);
        return isNaN(date) ? '' : date.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    }

    // Nome leggibile del disegno: "finestra 15", "finestra 15 retro" o "disegno 16"
    function designLabel(design) {
        const door = /^porta(\d+)(r?)$/.exec(design);
        if (door) return `finestra ${door[1]}${door[2] ? ' retro' : ''}`;
        const extra = /^extra-(\d+)$/.exec(design);
        return extra ? `disegno ${Number(extra[1])}` : String(design);
    }

    const METODI = { cash: 'contanti', stripe: 'carta/Satispay', link: 'link', bonifico: 'bonifico' };
    const euro = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
    async function loadSummary() {
        const total = document.getElementById('sum-total');
        const list = document.getElementById('sum-list');
        try {
            const data = await api('/api/mercatino/riepilogo');
            const t = data.totali || { contanti: data.total };
            const parts = [`contanti ${euro(t.contanti)}`];
            if (t.online) parts.push(`online ${euro(t.online)}`);
            if (t.in_attesa) parts.push(`⏳ ${t.in_attesa} in attesa`);
            total.textContent = `Oggi: ${data.count} pagate · ${parts.join(' · ')}`;
            list.innerHTML = '';
            data.cards.forEach(card => {
                const li = document.createElement('li');
                const stato = card.pagata ? (METODI[card.metodo] || card.metodo) : `⏳ ${METODI[card.metodo] || card.metodo} in attesa`;
                li.textContent = `${card.codice || '#' + card.id} · da ${card.donor_name} a ${card.recipient_name} · ${designLabel(card.card_design)} · ${stato}`;
                if (!card.pagata) li.classList.add('merc-attesa');
                list.appendChild(li);
            });
        } catch (error) {
            total.textContent = error.message;
        }
    }

    // Lista di invio WhatsApp: "Apri WhatsApp" porta a WhatsApp con numero e testo già pronti,
    // "Inviato" lo registra nel sistema dopo che chi invia ha premuto invio su WhatsApp
    function formatSentAt(sqlTime) {
        return formatTime(sqlTime.replace(' ', 'T') + 'Z');
    }

    function makeInvioRow(card) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `#${card.id} · ${card.recipient_name} · +${card.recipient_phone}`;
        li.appendChild(label);

        const open = document.createElement('a');
        open.className = 'merc-btn merc-btn-small';
        open.href = card.whatsapp_url;
        open.target = '_blank';
        open.rel = 'noopener';
        open.textContent = 'Apri WhatsApp';
        // Prima del 24 dicembre chiede conferma: il regalo non si può ancora aprire
        open.addEventListener('click', (e) => {
            if (new Date() < new Date('2026-12-23T23:00:00Z')
                && !window.confirm('Il regalo si apre dal 24 dicembre: se lo mandi ora, chi lo riceve vede solo «si apre il 24». Mandarlo lo stesso?')) {
                e.preventDefault();
            }
        });
        li.appendChild(open);

        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'merc-btn merc-btn-small';
        done.disabled = Boolean(card.sent_at);
        done.textContent = card.sent_at ? `Inviato ${formatSentAt(card.sent_at)}` : 'Inviato';
        done.addEventListener('click', async () => {
            done.disabled = true;
            try {
                await api(`/api/mercatino/invii/${card.id}/inviato`, { method: 'POST' });
                await loadInvii();
            } catch (error) {
                if (error.status === 401) {
                    clearPin();
                    location.reload();
                    return;
                }
                done.disabled = false;
                document.getElementById('invii-total').textContent = error.message;
            }
        });
        li.appendChild(done);
        return li;
    }

    async function loadInvii() {
        const total = document.getElementById('invii-total');
        const list = document.getElementById('invii-list');
        try {
            const data = await api('/api/mercatino/invii');
            total.textContent = `${data.sent} inviati su ${data.count} messaggi WhatsApp`;
            list.innerHTML = '';
            data.cards.forEach(card => list.appendChild(makeInvioRow(card)));
        } catch (error) {
            total.textContent = error.message;
        }
    }

    async function unlock() {
        const app = document.getElementById('merc-app');
        const gate = document.getElementById('merc-gate');
        try {
            config = await api('/api/mercatino/config');
            applyConfig();
            await loadDesigns();
            await loadSummary();
            await loadInvii();
            gate.hidden = true;
            app.hidden = false;
            // Ora che la sezione è visibile si possono misurare le frecce
            updateStripArrows();
            document.getElementById('vetrina-open').hidden = false;
            resetIdle();
            if (!config.vendita_attiva) {
                showAlert('sale-alert', 'Vendita ancora chiusa: i pagamenti non verranno registrati finché non si apre la vendita delle gift card.');
            }
        } catch (error) {
            clearPin();
            pin = '';
            app.hidden = true;
            gate.hidden = false;
            showAlert('gate-error', error.status === 401 ? 'PIN non valido' : error.message);
        }
    }

    document.getElementById('gate-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        pin = document.getElementById('pin-input').value.trim();
        if (!pin) return showAlert('gate-error', 'Inserisci il PIN');
        savePin(pin);
        showAlert('gate-error', '');
        await unlock();
    });

    // Primo passo: come vuole pagare. Si vedono solo i metodi attivi sul server,
    // e il modulo chiede solo i dati che servono per quel metodo.
    function applyConfig() {
        const ok = { cash: true, card: config.carta, satispay: config.carta, link: config.link, bonifico: config.bonifico };
        document.querySelectorAll('.merc-paybtn').forEach(b => { b.hidden = !ok[b.dataset.pay]; });
    }
    function choosePay(method) {
        payMethod = method;
        document.querySelectorAll('.merc-paybtn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pay === method)));
        const form = document.getElementById('sale-form');
        form.hidden = !method;
        if (!method) {
            document.getElementById('paynote').textContent = 'Tocca come vuole pagare: poi compili solo i dati che servono.';
            return;
        }
        const promise = method === 'link' || method === 'bonifico';
        // Contanti: niente codice fiscale. Cellulare di chi regala: solo per mandargli link o IBAN.
        document.getElementById('field-donor-cf').hidden = method === 'cash';
        document.getElementById('field-donor-phone').hidden = !promise;
        document.getElementById('hint-donor-email').textContent = promise
            ? `${method === 'link' ? 'per mandargli il link' : "per mandargli l'IBAN"}: serve l'email o il cellulare`
            : 'facoltativa: per la ricevuta';
        document.getElementById('paynote').textContent = `Scelto: ${PAY[method].label}. Puoi cambiarlo toccando un altro pulsante.`;
        fieldError('donor-email', '');
        showAlert('sale-alert', '');
    }
    document.getElementById('paychoice').addEventListener('click', (e) => {
        const b = e.target.closest('.merc-paybtn');
        if (!b) return;
        choosePay(b.dataset.pay);
        setTimeout(() => document.getElementById('sale-form').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    });

    // "Salva" controlla i dati e apre il popup: la vendita si registra solo dal tasto di pagamento nel popup.
    // Ogni errore compare sotto il suo campo, e in alto un avviso grande con l'elenco.
    document.getElementById('sale-form').addEventListener('submit', (e) => {
        e.preventDefault();
        clearFieldErrors();
        showAlert('sale-alert', '');
        const d = saleData();
        const errors = [];
        const add = (id, message) => { errors.push({ id, message }); fieldError(id, message); };

        if (!selectedDesign) errors.push({ id: null, message: 'scegli il disegno (tocca un disegno, poi "Scelgo questo disegno")' });
        if (!payMethod) errors.push({ id: null, message: 'scegli come vuole pagare' });
        if (!d.donor_name) add('donor-name', 'Scrivi nome e cognome di chi regala');
        if ((payMethod === 'link' || payMethod === 'bonifico') && !d.donor_email && !val('donor-phone')) {
            add('donor-email', `Per mandargli ${payMethod === 'link' ? 'il link' : "l'IBAN"} serve la sua email o il suo cellulare`);
        }
        if (d.donor_email && !EMAIL_RE.test(d.donor_email)) add('donor-email', 'Email non valida: controlla @ e il punto (es. mario@gmail.com)');
        if (!cfOk(d.donor_cf)) add('donor-cf', 'Codice fiscale non valido: controlla lettere e numeri (16 caratteri)');
        // Il cellulare serve anche se il QR non funziona e si manda il link: si svuota solo per i contanti
        if (payMethod === 'cash') document.getElementById('donor-phone').value = '';
        if (!phoneOk(val('donor-phone'))) add('donor-phone', 'Numero non valido: solo cifre, es. 333 1234567');
        if (!d.recipient_name) add('recipient-name', 'Scrivi il nome di chi riceve');
        if (d.recipient_email && !EMAIL_RE.test(d.recipient_email)) add('recipient-email', 'Email non valida: controlla @ e il punto (es. anna@gmail.com)');
        if (!phoneOk(d.recipient_phone)) add('recipient-phone', 'Numero non valido: solo cifre, es. 333 1234567');
        if (!d.recipient_email && !d.recipient_phone) add('recipient-email', "Serve l'email o il cellulare di chi riceve");
        else if (!d.send_email && !d.send_whatsapp) add('channels', 'Scegli come arriva il regalo: email, WhatsApp o entrambi');
        if (d.send_email && !d.recipient_email) add('recipient-email', "Per l'invio via email serve l'email di chi riceve");
        if (d.send_whatsapp && !d.recipient_phone) add('recipient-phone', "Per l'invio via WhatsApp serve il cellulare di chi riceve");
        if (!d.privacy_consent) add('privacy-consent', "Serve il consenso all'informativa privacy");

        if (errors.length) {
            const list = errors.map(x => x.message.charAt(0).toLowerCase() + x.message.slice(1));
            showAlert('sale-alert', `Da correggere: ${list.join('; ')}.`);
            const first = errors.find(x => x.id && x.id !== 'channels');
            if (first) setTimeout(() => document.getElementById(first.id).focus({ preventScroll: true }), 400);
            return;
        }
        openPreview(d.recipient_name);
    });

    // Svuota il modulo per il prossimo cliente
    function resetSale() {
        document.getElementById('sale-form').reset();
        clearFieldErrors();
        showAlert('sale-alert', '');
        selectedDesign = null;
        selectedSrc = null;
        document.querySelectorAll('.merc-design').forEach(b => b.setAttribute('aria-checked', 'false'));
        document.getElementById('merc-selected').textContent = 'nessuno';
        choosePay(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Schermata finale grande: il volontario vede subito che è andata
    function showFatto(text) {
        document.getElementById('fatto-text').textContent = text;
        document.getElementById('fatto').hidden = false;
        document.getElementById('fatto-new').focus();
        loadSummary();
        loadInvii();
    }
    document.getElementById('fatto-new').addEventListener('click', () => {
        document.getElementById('fatto').hidden = true;
        resetSale();
    });

    // Errore del server nel popup: avviso grande; PIN scaduto: si rientra
    function popupError(error) {
        if (error.status === 401) {
            clearPin();
            location.reload();
            return;
        }
        showAlert('preview-alert', error.message);
    }

    // Contanti: la card è già pagata
    async function registerSale() {
        const button = document.getElementById('preview-confirm');
        button.disabled = true;
        showAlert('preview-alert', '');
        try {
            const data = await api('/api/mercatino/cash', {
                method: 'POST',
                body: JSON.stringify({ ...saleData(), metodo: 'cash' })
            });
            closePreview();
            showFatto(`Gift card NATALE-${String(data.id).padStart(4, '0')} registrata, pagata in contanti. Si apre il ${formatTime(data.delivery_at)}.`);
        } catch (error) {
            popupError(error);
        } finally {
            button.disabled = false;
        }
    }

    // Promessa: link "paga dopo" o bonifico. La card resta in attesa finché il pagamento non arriva.
    let promessaText = '';
    async function registerPromise(metodo) {
        const button = document.getElementById('preview-confirm');
        button.disabled = true;
        showAlert('preview-alert', '');
        try {
            const data = await api('/api/mercatino/attesa', {
                method: 'POST',
                body: JSON.stringify({ ...saleData(), metodo })
            });
            closePreview();
            closePayQr();
            showPromessa(data);
        } catch (error) {
            popupError(error);
        } finally {
            button.disabled = false;
        }
    }

    function showPromessa(data) {
        const isLink = data.metodo === 'link';
        document.getElementById('promessa-title').textContent = isLink ? 'Paga dopo, con il link' : 'Bonifico: in attesa';
        document.getElementById('promessa-codice').textContent = data.codice;
        const canvas = document.getElementById('promessa-canvas');
        const iban = document.getElementById('promessa-iban');
        canvas.hidden = !isLink;
        iban.hidden = isLink;
        if (isLink) {
            drawQr(data.payUrl, canvas);
            promessaText = `🎄 Gift card di Natale per ${val('recipient-name')} (${data.codice})\nPaga 20 € con carta o Satispay entro il ${data.scadenza}:\n${data.payUrl}`;
        } else {
            iban.innerHTML = '';
            [['Intestato a', data.intestatario], ['IBAN', data.iban], ['Importo', '20,00 €'], ['Causale', data.causale], ['Entro il', data.scadenza]].forEach(([k, v]) => {
                const dt = document.createElement('dt'); dt.textContent = k;
                const dd = document.createElement('dd'); dd.textContent = v;
                iban.append(dt, dd);
            });
            promessaText = `🎄 Gift card di Natale per ${val('recipient-name')} (${data.codice})\nBonifico di 20,00 € entro il ${data.scadenza}\nIntestato a: ${data.intestatario}\nIBAN: ${data.iban}\nCausale: ${data.causale}`;
        }
        const note = [];
        if (data.email_inviata) note.push(`✉️ Email inviata a ${data.donor_email}.`);
        else if (data.donor_email) note.push(`⚠️ L'email a ${data.donor_email} non è partita: mandagli i dati su WhatsApp.`);
        else note.push('Nessuna email: mandagli i dati su WhatsApp, oppure fai inquadrare o fotografare questa schermata.');
        note.push(`La gift card parte solo se paga entro il ${data.scadenza}.`);
        document.getElementById('promessa-note').textContent = note.join(' ');
        const wa = document.getElementById('promessa-whatsapp');
        wa.href = `https://wa.me/${phoneForWa(val('donor-phone'))}?text=${encodeURIComponent(promessaText)}`;
        document.getElementById('promessa').hidden = false;
        document.getElementById('promessa-done').focus();
        loadSummary();
    }
    document.getElementById('promessa-copy').addEventListener('click', async (e) => {
        try {
            await navigator.clipboard.writeText(promessaText);
            e.target.textContent = 'Copiato ✓';
            setTimeout(() => { e.target.textContent = 'Copia il testo'; }, 1500);
        } catch (err) {
            e.target.textContent = 'Copia non riuscita';
        }
    });
    document.getElementById('promessa-done').addEventListener('click', () => {
        document.getElementById('promessa').hidden = true;
        resetSale();
    });

    // Pagamento con QR: il cliente paga dal suo telefono, con carta o Satispay (pagina Stripe).
    // Mentre il QR è aperto, ogni 3 secondi si chiede se il pagamento è arrivato.
    let qrPoll = null;
    async function showPayQr(tipo) {
        const button = document.getElementById('preview-confirm');
        button.disabled = true;
        showAlert('preview-alert', '');
        try {
            const response = await fetch('/api/natale/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...saleData(), canale: 'mercatino', solo: tipo })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.stripe_url) throw new Error(data.message || 'Errore nella creazione del pagamento');
            drawQr(data.stripe_url, document.getElementById('pay-qr-canvas'));
            document.getElementById('pay-qr-title').textContent = tipo === 'satispay' ? 'Inquadra per pagare con Satispay · 20 €' : 'Inquadra per pagare con carta · 20 €';
            document.getElementById('pay-qr-wait').textContent = '⏳ In attesa del pagamento…';
            document.getElementById('pay-qr').hidden = false;
            startQrPoll(data);
        } catch (error) {
            showAlert('preview-alert', error.message);
        } finally {
            button.disabled = false;
        }
    }
    function startQrPoll(data) {
        clearInterval(qrPoll);
        const started = Date.now();
        qrPoll = setInterval(async () => {
            // Dopo 15 minuti si smette di chiedere: il pagamento, se arriva, si vede comunque nel riepilogo
            if (Date.now() - started > 15 * 60 * 1000) { clearInterval(qrPoll); return; }
            try {
                const r = await fetch(`/api/natale/pagata/${encodeURIComponent(data.payment_id)}`);
                const s = await r.json();
                if (s.pagata) {
                    clearInterval(qrPoll);
                    document.getElementById('pay-qr').hidden = true;
                    closePreview();
                    showFatto(`Pagamento arrivato! Gift card NATALE-${String(data.id).padStart(4, '0')} pagata con carta o Satispay.`);
                }
            } catch (e) { /* rete instabile: si riprova al giro dopo */ }
        }, 3000);
    }

    // Disegna il QR del link di pagamento nel canvas (libreria qrcode-generator, caricata in pagina)
    function drawQr(text, canvas) {
        const generator = qrcode(0, 'M');
        generator.addData(text);
        generator.make();
        const size = 360;
        const cells = generator.getModuleCount();
        const scale = Math.floor(size / (cells + 8)) || 1;
        canvas.width = canvas.height = (cells + 8) * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        for (let r = 0; r < cells; r++) {
            for (let c = 0; c < cells; c++) {
                if (generator.isDark(r, c)) ctx.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
            }
        }
    }
    function closePayQr() {
        clearInterval(qrPoll);
        document.getElementById('pay-qr').hidden = true;
    }

    document.getElementById('pay-qr-close').addEventListener('click', closePayQr);
    document.getElementById('pay-qr-done').addEventListener('click', closePayQr);
    document.getElementById('pay-qr').addEventListener('click', (e) => {
        if (e.target.id === 'pay-qr') closePayQr();
    });
    // Un solo pulsante di conferma: fa quello che serve per il metodo scelto all'inizio
    document.getElementById('preview-confirm').addEventListener('click', () => {
        if (payMethod === 'cash') registerSale();
        else if (payMethod === 'card' || payMethod === 'satispay') showPayQr(payMethod);
        else if (payMethod === 'link' || payMethod === 'bonifico') registerPromise(payMethod);
    });
    document.getElementById('preview-change').addEventListener('click', () => {
        closePreview();
        document.getElementById('paychoice').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Il cliente non riesce a pagare col QR: stessa card, ma gli si manda il link (la vecchia pagina scade da sola)
    document.getElementById('pay-qr-link').addEventListener('click', () => { payMethod = 'link'; registerPromise('link'); });
    document.getElementById('preview-back').addEventListener('click', closePreview);
    document.getElementById('preview-close').addEventListener('click', closePreview);
    document.getElementById('preview').addEventListener('click', (e) => {
        if (e.target.id === 'preview') closePreview();
    });

    document.getElementById('sum-refresh').addEventListener('click', loadSummary);
    document.getElementById('invii-refresh').addEventListener('click', loadInvii);

    // Chi scrive un contatto vede subito il canale corrispondente già selezionato, ma può cambiarlo
    document.getElementById('recipient-email').addEventListener('input', (e) => {
        document.getElementById('send-email').checked = e.target.value.trim() !== '';
    });
    document.getElementById('recipient-phone').addEventListener('input', (e) => {
        document.getElementById('send-whatsapp').checked = e.target.value.trim() !== '';
    });

    // "Il regalo è per chi lo compra": copia nome ed email di chi regala in chi riceve
    document.getElementById('per-me').addEventListener('change', (e) => {
        if (!e.target.checked) return;
        document.getElementById('recipient-name').value = val('donor-name');
        if (val('donor-email')) {
            document.getElementById('recipient-email').value = val('donor-email');
            document.getElementById('send-email').checked = true;
        }
        if (val('donor-phone')) {
            document.getElementById('recipient-phone').value = val('donor-phone');
            document.getElementById('send-whatsapp').checked = true;
        }
    });
    // Mentre si corregge un campo, il suo errore sparisce
    document.getElementById('sale-form').addEventListener('input', (e) => {
        if (e.target.id) fieldError(e.target.id, '');
        if (e.target.id === 'send-email' || e.target.id === 'send-whatsapp') fieldError('channels', '');
    });
    document.getElementById('donor-cf').addEventListener('input', (e) => {
        const pos = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase().replace(/\s/g, '');
        try { e.target.setSelectionRange(pos, pos); } catch (err) { /* ignora */ }
    });

    // Vetrina: i disegni scorrono a tutto schermo per fermare la gente.
    // Parte con il tasto, o da sola dopo 2 minuti senza tocchi se non c'è un popup aperto.
    const IDLE_MS = 2 * 60 * 1000;
    let idleTimer = null;
    let vetrinaTimer = null;
    let vetrinaIndex = 0;
    function anyModalOpen() {
        return ['zoom', 'preview', 'pay-qr', 'promessa', 'fatto'].some(id => !document.getElementById(id).hidden);
    }
    function resetIdle() {
        clearTimeout(idleTimer);
        if (document.getElementById('merc-app').hidden) return;
        idleTimer = setTimeout(() => { if (!anyModalOpen()) startVetrina(false); else resetIdle(); }, IDLE_MS);
    }
    function vetrinaStep() {
        if (!doorsForVetrina.length) return;
        const a = document.getElementById('vetrina-a');
        const b = document.getElementById('vetrina-b');
        const [show, hide] = a.classList.contains('on') ? [b, a] : [a, b];
        show.src = doorsForVetrina[vetrinaIndex % doorsForVetrina.length];
        vetrinaIndex++;
        show.classList.add('on');
        hide.classList.remove('on');
    }
    function startVetrina(fullscreen) {
        const v = document.getElementById('vetrina');
        if (!v.hidden || !doorsForVetrina.length) return;
        v.hidden = false;
        vetrinaStep();
        clearInterval(vetrinaTimer);
        vetrinaTimer = setInterval(vetrinaStep, 5000);
        if (fullscreen && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { /* non supportato: va bene così */ });
        }
    }
    function stopVetrina() {
        const v = document.getElementById('vetrina');
        if (v.hidden) return;
        v.hidden = true;
        clearInterval(vetrinaTimer);
        document.getElementById('merc-designs').scrollIntoView({ behavior: 'smooth', block: 'start' });
        resetIdle();
    }
    document.getElementById('vetrina-open').addEventListener('click', () => startVetrina(true));
    document.getElementById('vetrina').addEventListener('click', stopVetrina);
    ['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, () => {
        if (document.getElementById('vetrina').hidden) resetIdle();
    }, { passive: true }));

    // Se il PIN è già in questa scheda, si entra direttamente
    pin = readPin();
    if (pin) unlock();
})();
