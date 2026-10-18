/**
 * mercatino.js - Vendita in contanti delle gift card di Natale, con PIN dei volontari
 */
(function () {
    const PIN_KEY = 'mercatinoPin';
    let pin = '';
    let selectedDesign = null;
    let selectedSrc = null;

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

    async function loadDesigns() {
        const response = await fetch('/data/avvento.json?v=2026-10-16ae');
        const data = await response.json();
        const doors = data.doors || [];
        const grid = document.getElementById('merc-designs');
        const strip = document.getElementById('merc-strip');
        grid.innerHTML = '';
        strip.innerHTML = '';
        doors.filter(d => d.disegno).forEach(door => {
            makeTile(`porta${door.day}`, `Finestra ${door.day}`, door.miniatura || door.disegno, door.disegno, grid);
        });
        doors.filter(d => d.disegno_retro).forEach(door => {
            makeTile(`porta${door.day}r`, `Finestra ${door.day}, retro`, door.disegno_retro, door.disegno_retro, strip);
        });
        updateStripArrows();
    }

    // Frecce del carosello dei retro: scorrono di due disegni alla volta
    function scrollStrip(direction) {
        const strip = document.getElementById('merc-strip');
        const step = (strip.querySelector('.merc-design')?.offsetWidth || 150) * 2 + 16;
        strip.scrollBy({ left: direction * step, behavior: 'smooth' });
    }
    document.getElementById('strip-prev').addEventListener('click', () => scrollStrip(-1));
    document.getElementById('strip-next').addEventListener('click', () => scrollStrip(1));
    // Le frecce compaiono solo se i disegni del retro non entrano tutti nella barra
    function updateStripArrows() {
        const strip = document.getElementById('merc-strip');
        const overflow = strip.scrollWidth > strip.clientWidth + 1;
        document.getElementById('strip-prev').hidden = !overflow;
        document.getElementById('strip-next').hidden = !overflow;
    }
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
        if (e.key === 'Escape') { closeZoom(); closePreview(); }
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
        showError('preview-error', '');
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

    async function loadSummary() {
        const total = document.getElementById('sum-total');
        const list = document.getElementById('sum-list');
        try {
            const data = await api('/api/mercatino/riepilogo');
            total.textContent = `Oggi: ${data.count} gift card · ${Number(data.total).toFixed(2).replace('.', ',')} € in contanti`;
            list.innerHTML = '';
            data.cards.forEach(card => {
                const li = document.createElement('li');
                li.textContent = `#${card.id} · da ${card.donor_name} a ${card.recipient_name} · finestra ${String(card.card_design).replace('porta', '').replace('r', ' retro')} · consegna ${formatTime(card.delivery_at)}`;
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
            await loadDesigns();
            await loadSummary();
            await loadInvii();
            gate.hidden = true;
            app.hidden = false;
        } catch (error) {
            clearPin();
            pin = '';
            app.hidden = true;
            gate.hidden = false;
            showError('gate-error', error.status === 401 ? 'PIN non valido' : error.message);
        }
    }

    document.getElementById('gate-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        pin = document.getElementById('pin-input').value.trim();
        if (!pin) return showError('gate-error', 'Inserisci il PIN');
        savePin(pin);
        showError('gate-error', '');
        await unlock();
    });

    // "Salva" controlla i dati e apre il popup: la vendita si registra solo dal tasto nel popup
    document.getElementById('sale-form').addEventListener('submit', (e) => {
        e.preventDefault();
        showError('sale-error', '');
        document.getElementById('sale-ok').hidden = true;

        const donorName = document.getElementById('donor-name').value.trim();
        const recipientName = document.getElementById('recipient-name').value.trim();
        const recipientEmail = document.getElementById('recipient-email').value.trim();
        const recipientPhone = document.getElementById('recipient-phone').value.trim();
        const sendEmail = document.getElementById('send-email').checked;
        const sendWhatsapp = document.getElementById('send-whatsapp').checked;

        if (!selectedDesign) return showError('sale-error', 'Scegli prima un disegno');
        if (!donorName || !recipientName) return showError('sale-error', 'Compila nome di chi regala e nome di chi riceve');
        if (!sendEmail && !sendWhatsapp) return showError('sale-error', 'Scegli come far arrivare il regalo: per email, per WhatsApp o per entrambi');
        if (sendEmail && !recipientEmail) return showError('sale-error', "Per l'invio via email serve l'email di chi riceve");
        if (sendWhatsapp && !recipientPhone) return showError('sale-error', 'Per WhatsApp serve il telefono di chi riceve');
        if (!recipientEmail && !recipientPhone) return showError('sale-error', 'Inserisci almeno un contatto di chi riceve: email o telefono');
        if (!document.getElementById('privacy-consent').checked) return showError('sale-error', "Serve il consenso all'informativa privacy");

        openPreview(recipientName);
    });

    async function registerSale() {
        const donorEmail = document.getElementById('donor-email').value.trim();
        const message = document.getElementById('message').value.trim();
        const button = document.getElementById('preview-confirm');
        button.disabled = true;
        showError('preview-error', '');
        try {
            const data = await api('/api/mercatino/cash', {
                method: 'POST',
                body: JSON.stringify({
                    donor_name: document.getElementById('donor-name').value.trim(),
                    donor_email: donorEmail || null,
                    recipient_name: document.getElementById('recipient-name').value.trim(),
                    recipient_email: document.getElementById('recipient-email').value.trim(),
                    recipient_phone: document.getElementById('recipient-phone').value.trim(),
                    send_email: document.getElementById('send-email').checked,
                    send_whatsapp: document.getElementById('send-whatsapp').checked,
                    privacy_consent: document.getElementById('privacy-consent').checked,
                    message: message || null,
                    card_design: selectedDesign
                })
            });
            closePreview();
            const ok = document.getElementById('sale-ok');
            ok.textContent = `Registrata la gift card n. ${data.id} in contanti. Si apre il ${formatTime(data.delivery_at)}.`;
            ok.hidden = false;
            document.getElementById('sale-form').reset();
            selectedDesign = null;
            selectedSrc = null;
            document.querySelectorAll('.merc-design').forEach(b => b.setAttribute('aria-checked', 'false'));
            document.getElementById('merc-selected').textContent = 'nessuno';
            await loadSummary();
            await loadInvii();
        } catch (error) {
            if (error.status === 401) {
                clearPin();
                location.reload();
                return;
            }
            showError('preview-error', error.message);
        } finally {
            button.disabled = false;
        }
    }

    document.getElementById('preview-confirm').addEventListener('click', registerSale);
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

    // Se il PIN è già in questa scheda, si entra direttamente
    pin = readPin();
    if (pin) unlock();
})();
