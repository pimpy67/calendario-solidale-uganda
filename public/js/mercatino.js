/**
 * mercatino.js - Vendita in contanti delle gift card di Natale, con PIN dei volontari
 */
(function () {
    const PIN_KEY = 'mercatinoPin';
    let pin = '';
    let selectedDesign = null;

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

    // Disegni scelti dal calendario dell'Avvento (una porta = un disegno)
    async function loadDesigns() {
        const response = await fetch('/data/avvento.json?v=2026-10-16ae');
        const data = await response.json();
        const doors = (data.doors || []).filter(d => d.disegno);
        const box = document.getElementById('merc-designs');
        box.innerHTML = '';
        doors.forEach(door => {
            const design = `porta${door.day}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'merc-design';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');
            btn.setAttribute('aria-label', `Finestra ${door.day}`);
            const img = document.createElement('img');
            img.src = door.miniatura || door.disegno;
            img.alt = `Finestra ${door.day}`;
            img.loading = 'lazy';
            // Sfondo sfocato dello stesso disegno: il riquadro si riempie senza tagliare il disegno
            btn.style.setProperty('--thumb', `url("${img.src}")`);
            btn.appendChild(img);
            btn.addEventListener('click', () => openZoom(design, door, btn));
            box.appendChild(btn);
        });
    }

    // Ingrandimento del disegno: si sceglie con il tasto al centro, come nel calendario
    let zoomDesign = null;
    let zoomDay = null;
    let zoomBtn = null;
    function openZoom(design, door, btn) {
        zoomDesign = design;
        zoomDay = door.day;
        zoomBtn = btn;
        const img = document.getElementById('zoom-img');
        img.src = door.disegno;
        img.alt = `Disegno della finestra ${door.day}`;
        document.getElementById('zoom-label').textContent = `Finestra ${door.day}`;
        document.getElementById('zoom').hidden = false;
        document.getElementById('zoom-choose').focus();
    }
    function closeZoom() {
        document.getElementById('zoom').hidden = true;
    }
    document.getElementById('zoom-choose').addEventListener('click', () => {
        selectDesign(zoomDesign, zoomDay, zoomBtn);
        closeZoom();
    });
    document.getElementById('zoom-close').addEventListener('click', closeZoom);
    document.getElementById('zoom').addEventListener('click', (e) => {
        if (e.target.id === 'zoom') closeZoom();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeZoom();
    });

    function selectDesign(design, day, btn) {
        selectedDesign = design;
        document.querySelectorAll('.merc-design').forEach(b => b.setAttribute('aria-checked', 'false'));
        btn.setAttribute('aria-checked', 'true');
        document.getElementById('merc-selected').textContent = `Finestra ${day}`;
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
                li.textContent = `#${card.id} · da ${card.donor_name} a ${card.recipient_name} · finestra ${String(card.card_design).replace('porta', '')} · consegna ${formatTime(card.delivery_at)}`;
                list.appendChild(li);
            });
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

    document.getElementById('sale-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        showError('sale-error', '');
        document.getElementById('sale-ok').hidden = true;

        const donorName = document.getElementById('donor-name').value.trim();
        const donorEmail = document.getElementById('donor-email').value.trim();
        const recipientName = document.getElementById('recipient-name').value.trim();
        const recipientEmail = document.getElementById('recipient-email').value.trim();
        const message = document.getElementById('message').value.trim();

        if (!selectedDesign) return showError('sale-error', 'Scegli prima un disegno');
        if (!donorName || !recipientName || !recipientEmail) return showError('sale-error', 'Compila nome di chi regala, nome di chi riceve ed email del destinatario');

        const button = document.getElementById('sale-submit');
        button.disabled = true;
        try {
            const data = await api('/api/mercatino/cash', {
                method: 'POST',
                body: JSON.stringify({
                    donor_name: donorName,
                    donor_email: donorEmail || null,
                    recipient_name: recipientName,
                    recipient_email: recipientEmail,
                    message: message || null,
                    card_design: selectedDesign
                })
            });
            const ok = document.getElementById('sale-ok');
            ok.textContent = `Registrata la gift card n. ${data.id} in contanti. Consegna il ${formatTime(data.delivery_at)}.`;
            ok.hidden = false;
            e.target.reset();
            selectedDesign = null;
            document.querySelectorAll('.merc-design').forEach(b => b.setAttribute('aria-checked', 'false'));
            document.getElementById('merc-selected').textContent = 'nessuno';
            await loadSummary();
        } catch (error) {
            if (error.status === 401) {
                clearPin();
                location.reload();
                return;
            }
            showError('sale-error', error.message);
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('sum-refresh').addEventListener('click', loadSummary);

    // Se il PIN è già in questa scheda, si entra direttamente
    pin = readPin();
    if (pin) unlock();
})();
