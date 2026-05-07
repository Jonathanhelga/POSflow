import Chart from 'chart.js/auto'
import { toggleModal } from './modal-handler';
import { fetchUserProfile, fetchInventory, fetchOrders } from './firebase';

let inventory_item = [];
let orders = [];

export async function initInsights(user){
    console.log(user);
    if(!user){ return; }
    try{
        inventory_item = await fetchInventory(user.uid);
        orders = await fetchOrders(user.uid);
        setupToolBar();
    }catch(err){
        console.error('Failed to load inventory:', err);
    }
}
function getStartDate(range) {                            
    const d = new Date();
    if (range === "today") { d.setHours(0, 0, 0, 0); } 
    else if (range === "7d") {d.setDate(d.getDate() - 7); } 
    else if (range === "30d") {d.setDate(d.getDate() - 30); } 
    else if (range === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); }
    return d;
}                                                            

function setupToolBar(){
    document.getElementById('sales-insights-open').addEventListener('click', () => { toggleModal('sales-insights-modal'); });
    const chips = document.querySelectorAll('.c-chip');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c=> { c.classList.remove('is-active'); })
            chip.classList.add('is-active');
            const range = chip.dataset.range;   
            const now = new Date();
            let startDate = getStartDate(range); 
            filterOrders(startDate, now);   
        });
    });
}

function filterOrders(startingDate, endDate){ console.log(startingDate + " - " + endDate);  }