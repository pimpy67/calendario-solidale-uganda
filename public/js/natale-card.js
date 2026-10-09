/**
 * natale-card.js - Pagina di apertura della gift card di Natale per il destinatario
 */
(function () {
    const CARD_IMAGES = {
        card1: '/images/gift_card/1.webp',
        card2: '/images/gift_card/2.webp',
        card3: '/images/gift_card/3.webp',
        card4: '/images/gift_card/4.webp',
        card5: '/images/gift_card/5.webp'
    };

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function show(id) {
        document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    // Fiocchi di neve (pochi, per non appesantire i telefoni)
    function startSnow() {
        if (reducedMotion) return;
        const container = document.getElementById('snow');
        const count = window.innerWidth < 600 ? 18 : 30;
        for (let i = 0; i < count; i++) {
            const flake = document.createElement('span');
            flake.className = 'flake';
            flake.textContent = '❄';
            flake.style.left = `${Math.random() * 100}%`;
            flake.style.fontSize = `${10 + Math.random() * 14}px`;
            flake.style.animationDuration = `${8 + Math.random() * 10}s`;
            flake.style.animationDelay = `${-Math.random() * 15}s`;
            container.appendChild(flake);
        }
    }

    // Data di apertura in ora di Roma, es. "25 dicembre alle 09:00"
    function formatDelivery(iso) {
        const date = new Date(iso);
        const day = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' }).format(date);
        const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(date);
        return `${day} alle ${time}`;
    }

    function openEnvelope(card) {
        const envelope = document.getElementById('envelope');
        const reveal = document.getElementById('reveal');
        envelope.classList.remove('pulse');
        envelope.classList.add('open');
        envelope.disabled = true;
        document.getElementById('hint').textContent = '';
        document.getElementById('intro').textContent = 'Ecco il tuo regalo di Natale solidale.';
        // Quando il lembo è aperto la busta sporge sopra il titolo: si nasconde dopo l'animazione
        setTimeout(() => {
            document.querySelector('.envelope-wrap').style.display = 'none';
        }, reducedMotion ? 0 : 950);
        setTimeout(() => reveal.classList.add('show'), reducedMotion ? 0 : 500);
    }

    function fillCard(card) {
        document.getElementById('greeting').textContent = `Buon Natale, ${card.recipient_name}!`;
        document.getElementById('card-image').src = card.image || CARD_IMAGES[card.card_design] || CARD_IMAGES.card1;
        // textContent: il messaggio di chi regala non viene mai interpretato come HTML
        document.getElementById('message').textContent = card.message || 'Buon Natale!';
        document.getElementById('from').textContent = `Con affetto da ${card.donor_name}`;
    }

    async function load() {
        const id = new URLSearchParams(window.location.search).get('id');
        if (!id) return show('state-missing');

        // Anteprima (?id=anteprima): busta con un messaggio di esempio, senza dati reali
        if (id === 'anteprima') {
            const sample = {
                available: true,
                recipient_name: 'Anna',
                donor_name: 'Mario',
                message: 'Buon Natale! Ti ho regalato un Natale solidale, con il disegno che preferisci.',
                card_design: 'card1',
                image: CARD_IMAGES.card1
            };
            fillCard(sample);
            show('state-open');
            startSnow();
            document.getElementById('envelope').addEventListener('click', () => openEnvelope(sample));
            return;
        }

        let data;
        try {
            const response = await fetch(`/api/natale/card/${encodeURIComponent(id)}`);
            if (response.status === 404) return show('state-missing');
            if (!response.ok) throw new Error('errore');
            data = await response.json();
        } catch (e) {
            return show('state-missing');
        }

        if (!data.available) {
            document.getElementById('delivery-date').textContent = formatDelivery(data.delivery_at);
            return show('state-wait');
        }

        fillCard(data);
        show('state-open');
        startSnow();
        document.getElementById('envelope').addEventListener('click', () => openEnvelope(data));
    }

    load();
})();
