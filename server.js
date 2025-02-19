require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

// Verificar que las variables de entorno estén configuradas
if (!MERCADOPAGO_ACCESS_TOKEN || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL) {
    console.error("Faltan variables de entorno necesarias");
    process.exit(1);
}

// 🔥 Inicializa Firebase con variables de entorno
admin.initializeApp({
    credential: admin.credential.cert({
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
});

const db = admin.firestore();

// 📌 Ruta principal que también devuelve un mensaje de prueba
app.get("/", (req, res) => {
    res.send("Este es un mensaje de prueba para verificar el servidor");
});

// 📌 Ruta para generar un pago y código QR
// 📌 Ruta para generar un pago y código QR
app.post("/create-payment", async (req, res) => {
    try {
        const { machine_id, items } = req.body;

        // Verificar que items esté definido y sea un arreglo
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: "'items' debe ser un arreglo" });
        }

        const preference = {
            items: items.map(item => ({
                title: item.name,
                quantity: item.quantity,
                currency_id: "MXN",
                unit_price: item.price
            })),
            external_reference: machine_id,
            notification_url: `https://tu-backend.vercel.app/payment-webhook`
        };

        const response = await axios.post("https://api.mercadopago.com/checkout/preferences", preference, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
            }
        });

        await db.collection('transactions').doc(response.data.id).set({
            machine_id,
            status: "pending",
            items
        });

        res.json({ payment_url: response.data.init_point, qr_data: response.data.id });
    } catch (error) {
        // Manejo de errores específico para token de acceso inválido
        if (error.response && error.response.status === 401) {
            console.error("Error de autenticación con MercadoPago: Token de acceso inválido o expirado.");
            return res.status(401).json({ error: "Token de acceso inválido o expirado. Verifica tu access_token de MercadoPago." });
        }
        
        console.error("Error creando pago:", error.response ? error.response.data : error);

        res.status(500).json({ error: "Error al crear pago" });
    }
});

// 📌 Webhook de MercadoPago para recibir confirmación de pago
app.post("/payment-webhook", async (req, res) => {
    try {
        const paymentData = req.body;
        const prefId = paymentData.data.id;

        const transactionRef = db.collection('transactions').doc(prefId);
        const doc = await transactionRef.get();

        if (!doc.exists) {
            console.log(`❌ Transacción no encontrada para el ID ${prefId}`);
            return res.sendStatus(404); // Not Found
        }

        const paymentStatus = paymentData.data.status;

        if (paymentStatus === 'approved') {
            await transactionRef.update({ status: "paid" });
            console.log(`✅ Pago confirmado para la máquina ${doc.data().machine_id}`);
        } else {
            await transactionRef.update({ status: "failed" });
            console.log(`❌ Pago fallido para la máquina ${doc.data().machine_id}`);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("Error en webhook:", error);
        res.sendStatus(500);
    }
});

// 📌 Ruta para verificar el estado de una transacción
app.get("/transaction-status/:transaction_id", async (req, res) => {
    const { transaction_id } = req.params;
    const transactionRef = db.collection('transactions').doc(transaction_id);
    const doc = await transactionRef.get();

    if (doc.exists) {
        res.json(doc.data());
    } else {
        res.json({ error: "Transacción no encontrada" });
    }
});

// 🚀 Iniciar el servidor  fgf
app.listen(PORT, () => {
    console.log(`Backend corriendo en http://localhost:${PORT}`);
});
