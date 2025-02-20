require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");

// Inicializar la aplicación Express hhh
const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

// 🔍 Verificación de variables de entorno
const requiredEnvVars = [
    "MERCADOPAGO_ACCESS_TOKEN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL"
];

let missingVars = [];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        missingVars.push(varName);
    }
});

// 🔴 Si faltan variables, mostrar advertencias y salir
if (missingVars.length > 0) {
    console.error("❌ Faltan las siguientes variables de entorno:", missingVars.join(", "));
    process.exit(1);
} else {
    console.log("✅ Todas las variables de entorno están configuradas correctamente.");
}

// 🔥 Inicializar Firebase
try {
    admin.initializeApp({
        credential: admin.credential.cert({
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL
        }),
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
    });

    console.log("✅ Firebase inicializado correctamente.");
} catch (error) {
    console.error("❌ Error al inicializar Firebase:", error);
    process.exit(1);
}

const db = admin.firestore();

// 🔍 Verificar conexión a Firebase Firestore
async function verificarConexionFirebase() {
    try {
        await db.collection("test").doc("connection_check").set({
            timestamp: new Date()
        });
        console.log("✅ Conexión a Firebase verificada correctamente.");
    } catch (error) {
        console.error("❌ Error en la conexión con Firebase:", error);
        process.exit(1);
    }
}

// Ejecutar verificación de conexión
verificarConexionFirebase();

// 📌 Ruta principal
app.get("/", (req, res) => {
    res.send("Este es un mensaje de prueba para verificar el servidor");
});

// 🚀 Iniciar el servidor
app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});
