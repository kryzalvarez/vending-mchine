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

// 🔍 Verificación detallada de variables de entorno
const requiredEnvVars = [
    "MERCADOPAGO_ACCESS_TOKEN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL"
];

let missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingVars.length > 0) {
    console.error("❌ Faltan las siguientes variables de entorno:", missingVars);
    process.exit(1);
} else {
    console.log("✅ Todas las variables de entorno están configuradas correctamente.");
    console.log(`🔹 MercadoPago Token: ${MERCADOPAGO_ACCESS_TOKEN ? MERCADOPAGO_ACCESS_TOKEN.slice(0, 6) + "********" : "No definido"}`);
    console.log(`🔹 Firebase Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`🔹 Firebase Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
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

// 📌 Ruta principal para verificar el servidor
app.get("/", (req, res) => {
    res.send("Este es un mensaje de prueba para verificar el servidor");
});

// 📌 Ruta para generar un pago y código QR
app.post("/create-payment", async (req, res) => {
    try {
        const { machine_id, items } = req.body;

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: "'items' debe ser un arreglo" });
        }

        console.log(`🛒 Creando pago para la máquina: ${machine_id}`);

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

        console.log(`✅ Pago generado exitosamente: ${response.data.id}`);

        res.json({ payment_url: response.data.init_point, qr_data: response.data.id });
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.error("❌ Error de autenticación con MercadoPago: Token inválido o expirado.");
            return res.status(401).json({ error: "Token de acceso inválido o expirado. Verifica tu access_token de MercadoPago." });
        }
        
        console.error("❌ Error creando pago:", error.response ? error.response.data : error);
        res.status(500).json({ error: "Error al crear pago" });
    }
});

// 📌 Webhook de MercadoPago para recibir confirmación de pago
app.post("/payment-webhook", async (req, res) => {
    try {
        const paymentData = req.body;
        const prefId = paymentData.data.id;

        console.log(`🔔 Webhook recibido para transacción: ${prefId}`);

        const transactionRef = db.collection('transactions').doc(prefId);
        const doc = await transactionRef.get();

        if (!doc.exists) {
            console.log(`❌ Transacción no encontrada para el ID ${prefId}`);
            return res.sendStatus(404);
        }

        const paymentStatus = paymentData.data.status;

        if (paymentStatus === 'approved') {
            await transactionRef.update({ status: "paid" });
            console.log(`✅ Pago aprobado para la máquina ${doc.data().machine_id}`);
        } else {
            await transactionRef.update({ status: "failed" });
            console.log(`❌ Pago fallido para la máquina ${doc.data().machine_id}`);
        }

        res.sendStatus(200);
    } catch (error) {
        console.error("❌ Error en webhook:", error);
        res.sendStatus(500);
    }
});

// 📌 Ruta para verificar el estado de una transacción
app.get("/transaction-status/:transaction_id", async (req, res) => {
    const { transaction_id } = req.params;
    console.log(`🔍 Consultando estado de transacción: ${transaction_id}`);

    const transactionRef = db.collection('transactions').doc(transaction_id);
    const doc = await transactionRef.get();

    if (doc.exists) {
        console.log(`✅ Transacción encontrada: ${JSON.stringify(doc.data())}`);
        res.json(doc.data());
    } else {
        console.log(`❌ Transacción no encontrada: ${transaction_id}`);
        res.json({ error: "Transacción no encontrada" });
    }
});

// 🚀 Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});
