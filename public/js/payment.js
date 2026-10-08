/**
 * Payment.js - Gestione del popup di pagamento e integrazione Satispay
 */

const Payment = (function() {
    // Stato corrente
    let selectedDate = null;
    let isProcessing = false;
    let selectedCard = 'card1';

    // Elementi DOM
    let modal;
    let closeBtn;
    let selectedDateEl;
    let donorNameInput;
    let donorSurnameInput;
    let donorCFInput;
    let donorEmailInput;
    let donorFieldsSection;
    let isAnonymousCheckbox;
    let isGiftCheckbox;
    let giftSection;
    let giftRecipientNameInput;
    let giftEmailInput;
    let giftMessageInput;
    let payWithSatispayBtn;
    let payWithStripeBtn;
    let privacyConsentCheckbox;

    /**
     * Inizializza il modulo pagamento
     */
    function init() {
        // Recupera elementi DOM
        modal = document.getElementById('paymentModal');
        closeBtn = document.getElementById('closeModal');
        selectedDateEl = document.getElementById('selectedDate');
        donorNameInput = document.getElementById('donorName');
        donorSurnameInput = document.getElementById('donorSurname');
        donorCFInput = document.getElementById('donorCF');
        donorEmailInput = document.getElementById('donorEmail');
        donorFieldsSection = document.getElementById('donorFieldsSection');
        isAnonymousCheckbox = document.getElementById('isAnonymous');
        isGiftCheckbox = document.getElementById('isGift');
        giftSection = document.getElementById('giftSection');
        giftRecipientNameInput = document.getElementById('giftRecipientName');
        giftEmailInput = document.getElementById('giftEmail');
        giftMessageInput = document.getElementById('giftMessage');
        payWithSatispayBtn = document.getElementById('payWithSatispay');
        payWithStripeBtn = document.getElementById('payWithStripe');
        privacyConsentCheckbox = document.getElementById('privacyConsent');

        // Verifica che closeBtn esista
        if (!closeBtn) {
            console.error('closeBtn non trovato!');
            return;
        }

        // Direct listener sulla X - uses capture phase to intercept
        closeBtn.addEventListener('click', closeModal, true);
        closeBtn.addEventListener('touchend', closeModal, true);
        
        // Modal overlay listener
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Checkbox anonimo nasconde/mostra sezione dati donatore
        isAnonymousCheckbox.addEventListener('change', () => {
            const isAnon = isAnonymousCheckbox.checked;
            donorFieldsSection.style.display = isAnon ? 'none' : 'block';
            if (isAnon) {
                donorNameInput.value = '';
                donorSurnameInput.value = '';
                donorCFInput.value = '';
                donorEmailInput.value = '';
                // Rimuovi eventuali stati di errore
                clearFieldErrors(donorFieldsSection);
            }
        });

        // Checkbox regalo mostra/nasconde sezione gift
        isGiftCheckbox.addEventListener('change', () => {
            giftSection.classList.toggle('active', isGiftCheckbox.checked);
            if (!isGiftCheckbox.checked) {
                giftRecipientNameInput.value = '';
                giftEmailInput.value = '';
                giftMessageInput.value = '';
            }
        });

        // Selettore gift card + bottone zoom
        const giftcardSelector = document.getElementById('giftcardSelector');
        if (giftcardSelector) {
            giftcardSelector.addEventListener('click', (e) => {
                // Click su bottone zoom = apri preview
                if (e.target.closest('.giftcard-zoom-btn')) {
                    e.stopPropagation();
                    const option = e.target.closest('.giftcard-option');
                    if (option) {
                        const img = option.querySelector('img');
                        openGiftcardPreview(img.src);
                    }
                    return;
                }

                // Click sulla card = seleziona
                const option = e.target.closest('.giftcard-option');
                if (!option) return;
                giftcardSelector.querySelectorAll('.giftcard-option').forEach(el => el.classList.remove('selected'));
                option.classList.add('selected');
                selectedCard = option.dataset.card;
            });
        }

        // Preview fullscreen gift card
        const previewOverlay = document.getElementById('giftcardPreview');
        if (previewOverlay) {
            previewOverlay.addEventListener('click', () => {
                previewOverlay.classList.remove('active');
            });
        }

        // Pulsanti pagamento
        payWithStripeBtn.addEventListener('click', () => handlePayment('stripe'));
        payWithSatispayBtn.addEventListener('click', () => handlePayment('satispay'));

        // ESC per chiudere
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (previewOverlay && previewOverlay.classList.contains('active')) {
                    previewOverlay.classList.remove('active');
                } else if (modal.classList.contains('active')) {
                    closeModal();
                }
            }
        });

        // Privacy modal
        const privacyModal = document.getElementById('privacyModal');
        const openPrivacyBtn = document.getElementById('openPrivacy');
        const openPrivacyFromFormBtn = document.getElementById('openPrivacyFromForm');
        const closePrivacyBtn = document.getElementById('closePrivacy');
        const closePrivacyBtn2 = document.getElementById('closePrivacyBtn');

        if (openPrivacyBtn) {
            openPrivacyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                privacyModal.classList.add('active');
            });
        }
        if (openPrivacyFromFormBtn) {
            openPrivacyFromFormBtn.addEventListener('click', (e) => {
                e.preventDefault();
                privacyModal.classList.add('active');
            });
        }
        if (closePrivacyBtn) {
            closePrivacyBtn.addEventListener('click', () => privacyModal.classList.remove('active'));
        }
        if (closePrivacyBtn2) {
            closePrivacyBtn2.addEventListener('click', () => privacyModal.classList.remove('active'));
        }
        if (privacyModal) {
            privacyModal.addEventListener('click', (e) => {
                if (e.target === privacyModal) privacyModal.classList.remove('active');
            });
        }
    }

    /**
     * Apre la preview fullscreen di una gift card
     */
    function openGiftcardPreview(imageSrc) {
        const overlay = document.getElementById('giftcardPreview');
        const img = document.getElementById('giftcardPreviewImg');
        if (overlay && img) {
            img.src = imageSrc;
            overlay.classList.add('active');
        }
    }

    /**
     * Apre il modal di pagamento
     */
    function openModal(day, month, year) {
        selectedDate = { day, month, year };

        // Formatta data
        const monthName = Calendar.MONTHS[month - 1];
        selectedDateEl.textContent = `${day} ${monthName} ${year}`;

        // Reset form
        donorNameInput.value = '';
        donorSurnameInput.value = '';
        donorCFInput.value = '';
        donorEmailInput.value = '';
        donorFieldsSection.style.display = 'block';
        isAnonymousCheckbox.checked = false;
        // Rimuovi stati di errore
        clearFieldErrors(modal);
        // Rimuovi popup validazione se presente
        document.querySelectorAll('.validation-popup, .validation-bar').forEach(p => p.remove());
        isGiftCheckbox.checked = false;
        giftSection.classList.remove('active');
        giftRecipientNameInput.value = '';
        giftEmailInput.value = '';
        giftMessageInput.value = '';
        selectedCard = 'card1';
        const giftcardOptions = document.querySelectorAll('.giftcard-option');
        giftcardOptions.forEach((el, i) => el.classList.toggle('selected', i === 0));
        isProcessing = false;
        payWithSatispayBtn.classList.remove('loading');
        payWithStripeBtn.classList.remove('loading');
        privacyConsentCheckbox.checked = false;

        // Mostra modal
        modal.classList.add('active');
        donorNameInput.focus();
    }

    /**
     * Chiude il modal
     */
    function closeModal() {
        modal.classList.remove('active');
        selectedDate = null;
        isProcessing = false;
        payWithSatispayBtn.classList.remove('loading');
        payWithStripeBtn.classList.remove('loading');
    }

    /**
     * Valida il Codice Fiscale italiano (formato + carattere di controllo)
     */
    function isValidCodiceFiscale(cf) {
        cf = cf.toUpperCase();
        // Formato: 6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre + 1 lettera
        if (!/^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/.test(cf)) return false;

        // Tabella valori caratteri dispari (posizioni 1,3,5,...)
        const odd = {
            '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
            'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,
            'K':2,'L':4,'M':18,'N':20,'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,
            'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23
        };
        // Tabella valori caratteri pari (posizioni 2,4,6,...)
        const even = {
            '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
            'A':0,'B':1,'C':2,'D':3,'E':4,'F':5,'G':6,'H':7,'I':8,'J':9,
            'K':10,'L':11,'M':12,'N':13,'O':14,'P':15,'Q':16,'R':17,'S':18,'T':19,
            'U':20,'V':21,'W':22,'X':23,'Y':24,'Z':25
        };

        let sum = 0;
        for (let i = 0; i < 15; i++) {
            sum += (i % 2 === 0) ? odd[cf[i]] : even[cf[i]];
        }
        const expectedCheck = String.fromCharCode(65 + (sum % 26));
        return cf[15] === expectedCheck;
    }

    /**
     * Segna un campo come errato: bordo rosso e messaggio sotto il campo.
     * L'errore sparisce appena l'utente modifica il campo (watchEl).
     */
    function setFieldError(el, message, watchEl = el) {
        el.classList.add('form-error');
        const group = el.closest('.form-group') || el.parentElement;
        const msg = document.createElement('small');
        msg.className = 'field-error-msg';
        msg.textContent = message;
        group.appendChild(msg);
        const label = group.querySelector('label');
        if (label) label.classList.add('label-error');
        const clear = () => {
            el.classList.remove('form-error');
            if (label) label.classList.remove('label-error');
            msg.remove();
        };
        watchEl.addEventListener('input', clear, { once: true });
        watchEl.addEventListener('change', clear, { once: true });
    }

    /**
     * Rimuove errori e messaggi dentro un contenitore
     */
    function clearFieldErrors(root) {
        root.querySelectorAll('.form-error').forEach(el => el.classList.remove('form-error'));
        root.querySelectorAll('.field-error-msg').forEach(el => el.remove());
        root.querySelectorAll('.label-error').forEach(el => el.classList.remove('label-error'));
    }

    /**
     * Porta il campo in vista, lo mette a fuoco e lo fa lampeggiare due volte
     */
    function focusField(el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = el.matches('input, textarea') ? el : el.querySelector('input');
        if (input) input.focus({ preventScroll: true });
        el.classList.remove('field-attention');
        void el.offsetWidth; // riavvia l'animazione
        el.classList.add('field-attention');
        el.addEventListener('animationend', () => el.classList.remove('field-attention'), { once: true });
    }

    /**
     * Gestisce il pagamento (Stripe o Satispay)
     */
    async function handlePayment(method) {
        if (isProcessing) return;

        // Valida input
        const isAnonymous = isAnonymousCheckbox.checked;
        const donorName = donorNameInput.value.trim();
        const donorSurname = donorSurnameInput.value.trim();
        const donorCF = donorCFInput.value.trim().toUpperCase();
        const donorEmail = donorEmailInput.value.trim();
        const isGift = isGiftCheckbox.checked;

        // Rimuovi errori precedenti
        clearFieldErrors(modal);
        document.querySelectorAll('.validation-popup, .validation-bar').forEach(p => p.remove());

        // Raccoglie tutti gli errori: {label, el} nell'ordine del modulo
        const errors = [];

        if (!isAnonymous) {
            if (!donorName) { setFieldError(donorNameInput, 'Campo obbligatorio'); errors.push({ label: 'Nome', el: donorNameInput }); }
            if (!donorSurname) { setFieldError(donorSurnameInput, 'Campo obbligatorio'); errors.push({ label: 'Cognome', el: donorSurnameInput }); }
            if (!donorCF) {
                setFieldError(donorCFInput, 'Campo obbligatorio');
                errors.push({ label: 'Codice Fiscale', el: donorCFInput });
            } else if (!isValidCodiceFiscale(donorCF)) {
                setFieldError(donorCFInput, 'Codice fiscale non valido');
                errors.push({ label: 'Codice Fiscale non valido', el: donorCFInput });
            }
            if (!donorEmail) {
                setFieldError(donorEmailInput, 'Campo obbligatorio');
                errors.push({ label: 'Email', el: donorEmailInput });
            } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(donorEmail)) {
                setFieldError(donorEmailInput, 'Email non valida');
                errors.push({ label: 'Email non valida', el: donorEmailInput });
            }
        }

        // Consenso privacy
        if (!privacyConsentCheckbox.checked) {
            const privacyGroup = privacyConsentCheckbox.closest('.privacy-checkbox-group');
            setFieldError(privacyGroup, "Devi accettare l'informativa privacy per continuare", privacyConsentCheckbox);
            errors.push({ label: 'Accettazione informativa privacy', el: privacyGroup });
        }

        // Campi regalo
        if (isGift) {
            const giftEmail = giftEmailInput.value.trim();
            const giftRecipientName = giftRecipientNameInput.value.trim();
            if (!giftRecipientName) {
                setFieldError(giftRecipientNameInput, 'Campo obbligatorio');
                errors.push({ label: 'Nome del destinatario', el: giftRecipientNameInput });
            }
            if (!giftEmail) {
                setFieldError(giftEmailInput, 'Campo obbligatorio');
                errors.push({ label: 'Email del destinatario', el: giftEmailInput });
            }
        }

        if (errors.length > 0) {
            // Ordine del modulo: dall'alto in basso
            errors.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
            showValidationPopup(errors);
            return;
        }

        // Inizia processing
        isProcessing = true;
        const activeBtn = method === 'stripe' ? payWithStripeBtn : payWithSatispayBtn;
        activeBtn.classList.add('loading');

        try {
            // Prepara dati
            const donationData = {
                day: selectedDate.day,
                month: selectedDate.month,
                year: selectedDate.year,
                donor_name: isAnonymous ? null : donorName,
                donor_surname: isAnonymous ? null : donorSurname,
                donor_cf: isAnonymous ? null : donorCF,
                donor_email: isAnonymous ? null : donorEmail,
                is_anonymous: isAnonymous,
                payment_method: method
            };

            // Aggiungi dati regalo se attivo
            if (isGift) {
                donationData.is_gift = true;
                donationData.gift_email = giftEmailInput.value.trim();
                donationData.gift_recipient_name = giftRecipientNameInput.value.trim();
                donationData.gift_message = giftMessageInput.value.trim();
            }
            donationData.gift_card_design = selectedCard;

            // Crea donazione sul server
            const response = await fetch('/api/donations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(donationData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Errore nella creazione della donazione');
            }

            const data = await response.json();

            // Redirect al gateway di pagamento
            if (data.stripe_url) {
                window.location.href = data.stripe_url;
            } else if (data.satispay_url) {
                window.location.href = data.satispay_url;
            } else {
                // Per test senza gateway configurato - simula successo
                simulatePaymentSuccess(data.id);
            }

        } catch (error) {
            console.error('Errore pagamento:', error);
            alert(`Errore: ${error.message}`);
            isProcessing = false;
            activeBtn.classList.remove('loading');
        }
    }

    /**
     * Simula un pagamento completato (per test)
     */
    async function simulatePaymentSuccess(donationId) {
        try {
            // Conferma il pagamento sul server
            const response = await fetch(`/api/donations/${donationId}/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Redirect alla pagina di successo
                window.location.href = `/payment-success?donation_id=${donationId}`;
            } else {
                throw new Error('Errore conferma pagamento');
            }

        } catch (error) {
            console.error('Errore conferma:', error);
            alert('Errore nella conferma del pagamento');
            isProcessing = false;
            payWithSatispayBtn.classList.remove('loading');
            payWithStripeBtn.classList.remove('loading');
        }
    }

    /**
     * Mostra messaggio di successo con opzione download gift card
     */
    function showSuccessMessage() {
        const monthName = Calendar.MONTHS[selectedDate.month - 1];
        let message = `Grazie per la tua donazione!\n\nHai adottato il ${selectedDate.day} ${monthName} ${selectedDate.year}.\n\nLa Casa Famiglia in Uganda ti ringrazia di cuore!`;

        if (isGiftCheckbox.checked) {
            message += `\n\nUna gift card verrà inviata a ${giftEmailInput.value.trim()}!`;
            alert(message);
            // Offri il download della gift card selezionata
            downloadGiftCard();
        } else {
            alert(message);
        }
    }

    /**
     * Scarica la gift card selezionata
     */
    function downloadGiftCard() {
        const cardNumber = selectedCard.replace('card', '');
        const imgUrl = `/images/gift_card/${cardNumber}.webp`;

        const link = document.createElement('a');
        link.href = imgUrl;
        link.download = `gift-card-effata-${cardNumber}.webp`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Mostra un avviso in basso con i campi mancanti, poi porta l'utente su ciascun campo
     * dall'alto in basso, fino alla privacy. Il passaggio si ferma appena l'utente interagisce.
     * @param {Array<{label: string, el: HTMLElement}>} errors - già in ordine di pagina
     */
    function showValidationPopup(errors) {
        document.querySelectorAll('.validation-bar').forEach(b => b.remove());

        const bar = document.createElement('div');
        bar.className = 'validation-bar';
        bar.innerHTML = '<span class="validation-bar-text">Completa i campi in rosso: <strong></strong></span>' +
                        '<button type="button" class="validation-bar-close" aria-label="Chiudi">&times;</button>';
        bar.querySelector('strong').textContent = errors.map(e => e.label).join(', ');
        document.body.appendChild(bar);

        let stopped = false;
        const stop = () => {
            stopped = true;
            document.removeEventListener('pointerdown', stop, true);
            document.removeEventListener('keydown', stop, true);
        };
        document.addEventListener('pointerdown', stop, true);
        document.addEventListener('keydown', stop, true);
        bar.querySelector('.validation-bar-close').addEventListener('click', () => bar.remove());

        // Un campo alla volta, dall'alto in basso
        let index = 0;
        const next = () => {
            if (stopped || index >= errors.length) {
                stop();
                return;
            }
            focusField(errors[index].el);
            index++;
            setTimeout(next, 1600);
        };
        next();
    }

    /**
     * Chiamato quando un pagamento e confermato via webhook
     */
    function onPaymentConfirmed(donationData) {
        Calendar.refresh();
    }

    // API pubblica
    return {
        init,
        openModal,
        closeModal,
        onPaymentConfirmed
    };
})();
