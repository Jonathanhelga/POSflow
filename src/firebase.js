import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, addDoc, getDoc, collection, query, where, orderBy, getDocs, serverTimestamp  } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "minipos-d9d92.firebaseapp.com",
  projectId: "minipos-d9d92",
  storageBucket: "minipos-d9d92.firebasestorage.app",
  messagingSenderId: "481588556736",
  appId: "1:481588556736:web:ae014a234e674f16990e25",
  measurementId: "G-ZVV40CPVKP"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export async function registerUser(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    return user;
}
export async function submitSettingsData(formData){
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in!");
    await setDoc(doc(db, "users", user.uid), {
        username: formData.username,
        business_name: formData.businessName,
        business_address: formData.businessAddress,
        business_phone: formData.businessPhone ,
        business_instagram: formData.businessInst,
        business_email: formData.businessEmail,
        tax_rate: formData.tax_rate,
        invoice_prefix: formData.invoice_prefix,
        printer_size: formData.paper_size,
        receipt_footer: formData.receipt_footer,
        created_at: new Date().toISOString(),
        ownerId: user.uid
    });

}

export async function loginUser(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
}

export async function LogOutUser(){
    try{
        await signOut(auth);
        console.log("User signed out successfully!");
    }catch(e){  
        alert("Sign Out Error: " + e.message); 
        throw e; 
    }
}

export async function submitItemData(itemData, uid){
    try {
        const inventoryRef = collection(db, "inventory");
        const docRef = await addDoc(inventoryRef, {
            ...itemData,
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(), // Better for sorting than local time
            updateQuantity: false,
            ownerId: uid
        });

        return {
            id: docRef.id,
            ...itemData,
            ownerId: uid 
        };
    } catch (error) {
        console.error("Error adding document: ", error);
        throw error;
    }
}

export async function fetchInventory(uid) {
    const q = query(
        collection(db, "inventory"),
        where("ownerId", "==", uid),
        orderBy("lastUpdated")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchOrders(uid) {
    const q = query(
        collection(db, "orders"),
        where("ownerId", "==", uid),
        orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchUserProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? snap.data() : null;
}

export async function submitOrder(orderPayload, uid){
    try {
        const orderRef = collection(db, "orders");
        const docRef = await addDoc(orderRef, {
            ...orderPayload,
            ownerId: uid,
            createdAt: serverTimestamp(),
        });
    return docRef.id;
    } catch (error) {
        
    }
}