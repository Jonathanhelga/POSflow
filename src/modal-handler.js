export function toggleModal(idName){
    const modal = document.getElementById(idName);
    const handleBackdropClick = (event) => { 
        if (event.target === modal) toggleModal(idName); 
    };

    // Modals that hold unsaved, hard-to-recover input should NOT close on backdrop click,
    // so a stray click can't discard a checkout in progress.
    const noBackdropClose = ['customer-checkout-modal'];

    if(modal.classList.contains('is-hidden')){
        modal.classList.remove('is-hidden');
        if (!noBackdropClose.includes(idName)) modal.addEventListener('click', handleBackdropClick);
    }

    else {
        modal.classList.add('is-closing');
        modal.addEventListener('animationend', function() {
            modal.classList.add('is-hidden');
            modal.classList.remove('is-closing');
            modal.onclick = null;
        }, { once: true });
        modal.removeEventListener('click', handleBackdropClick);
    }
}

export function modal_handler(){
    document.getElementById('js-features-open').addEventListener('click', function (){
        toggleModal('features-modal');
    });
    
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', function(e) {
            const modalId = e.target.closest('[data-modal-close]').getAttribute('data-modal-close');
            toggleModal(modalId);
        });
    });
}   
    
