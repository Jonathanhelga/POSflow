export function toggleModal(idName){
    const modal = document.getElementById(idName);
    const handleBackdropClick = (event) => { 
        if (event.target === modal) toggleModal(idName); 
    };

    if(modal.classList.contains('is-hidden')){  
        modal.classList.remove('is-hidden'); 
        modal.addEventListener('click', handleBackdropClick);
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
    document.getElementById('js-item-create-open').addEventListener('click', function (){
        toggleModal('item-create-modal');
        console.log("button is clicked");
    });

    document.getElementById('js-features-open').addEventListener('click', function (){
        toggleModal('features-modal');
        console.log("button is clicked");
    });

    document.getElementById('js-order-history-open').addEventListener('click', function (){
        toggleModal('order-history-modal');
        console.log("button is clicked");
    });

    document.getElementById('inventory-update-open').addEventListener('click', function (){
        toggleModal('features-modal');
        toggleModal('inventory-update-modal');
    });
    
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', function(e) {
            const modalId = e.target.closest('[data-modal-close]').getAttribute('data-modal-close');
            toggleModal(modalId);
        });
    });
}   
    
