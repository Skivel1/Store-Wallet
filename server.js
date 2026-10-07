const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

// Solo desactivar la verificación TLS si se pide explícitamente (no recomendado en producción)
if (process.env.ALLOW_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Solo se sirve la carpeta /public (antes se servía todo el proyecto, incluido server.js con el token)
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIGURACIÓN DE PASSKIT
// ============================================================
const PASSKIT_API_TOKEN = process.env.PASSKIT_API_TOKEN;
if (!PASSKIT_API_TOKEN) {
    console.error('❌ Falta la variable de entorno PASSKIT_API_TOKEN (revisa .env.example)');
    process.exit(1);
}
const PROGRAM_ID = process.env.PASSKIT_PROGRAM_ID || '7M5zliU32a3mlAgSEHnqGb';
const PUNTOS_POR_VISITA = parseInt(process.env.PUNTOS_POR_VISITA || '10', 10);

let visitasHoy = new Set();
let diaActual = new Date().toDateString();

function verificarReinicioDia() {
    const hoy = new Date().toDateString();
    if (diaActual !== hoy) {
        visitasHoy.clear();
        diaActual = hoy;
        console.log('🔄 00:00 hrs: Contador de visitas reiniciado.');
    }
}

function extraerPassId(input) {
    if (!input) return '';
    const texto = input.trim();
    if (texto.includes('/')) {
        const partes = texto.split('/');
        return partes[partes.length - 1];
    }
    return texto;
}

async function obtenerMiembroPassKit(passId) {
    const servidores = ['https://api.pub1.passkit.io', 'https://api.pub2.passkit.io'];

    for (const baseUrl of servidores) {
        const endpoints = [
            `${baseUrl}/members/member/id/${passId}`,
            `${baseUrl}/members/member/externalId/${passId}`
        ];

        for (const url of endpoints) {
            console.log(`🔎 Consultando en: ${url}`);
            try {
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${PASSKIT_API_TOKEN}`,
                        'Accept': 'application/json'
                    }
                });

                if (res.status === 200) {
                    const data = await res.json();
                    return { success: true, baseUrl, memberData: data };
                }
            } catch (e) {
                console.log(`❌ Error al conectar con ${url}: ${e.message}`);
            }
        }
    }

    return { success: false };
}

async function sumarPuntosPassKit(baseUrl, passId, puntos) {
    const url = `${baseUrl}/members/member/points/earn`;
    console.log(`➕ Sumando ${puntos} puntos en: ${url}`);

    const payload = {
        programId: PROGRAM_ID,
        id: passId,
        points: puntos
    };

    try {
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${PASSKIT_API_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (res.status === 200) {
            const data = await res.json();
            return { success: true, data };
        }
    } catch (e) {
        console.log(`❌ Error al abonar puntos: ${e.message}`);
    }

    return { success: false };
}

// ============================================================
// RUTAS DEL SERVIDOR
// ============================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/escanear', async (req, res) => {
    verificarReinicioDia();

    let rawPassId = req.body.passId;
    const passId = extraerPassId(rawPassId);

    console.log(`\n-----------------------------------`);
    console.log(`📥 QR Escaneado: "${rawPassId}" -> Pass ID: "${passId}"`);

    if (!passId) {
        return res.status(400).json({ estado: 'error', mensaje: 'ID de pase no válido' });
    }

    if (visitasHoy.has(passId)) {
        console.log(`⚠️ El cliente con ID ${passId} ya registró su visita hoy.`);
        return res.json({ estado: 'ya_visitado' });
    }

    try {
        const resultadoObtener = await obtenerMiembroPassKit(passId);

        if (!resultadoObtener.success) {
            console.error(`❌ No se encontró el miembro con ID ${passId}`);
            return res.status(404).json({
                estado: 'error',
                mensaje: 'Pase no encontrado en PassKit.'
            });
        }

        const memberData = resultadoObtener.memberData;
        const baseUrlExitoso = resultadoObtener.baseUrl;

        // Extraer Nombre mapeado con la tabla de PassKit
        const persona = memberData.person || {};
        const passData = memberData.passData || {};
        const membersData = memberData.membersData || {};

        let nombreCliente = 
            persona.forename || 
            persona.displayName || 
            persona.fullName ||
            passData['FULL NAME'] || 
            passData['FULL name'] || 
            passData['fullName'] ||
            membersData['FULL NAME'] || 
            membersData['FULL name'] || 
            membersData['fullName'] ||
            'Cliente VIP';

        if (persona.forename && persona.surname) {
            nombreCliente = `${persona.forename} ${persona.surname}`.trim();
        }

        const resultadoPuntos = await sumarPuntosPassKit(baseUrlExitoso, passId, PUNTOS_POR_VISITA);

        let puntosFinales = parseInt(memberData.points || 0, 10) + PUNTOS_POR_VISITA;

        if (resultadoPuntos.success && resultadoPuntos.data.points !== undefined) {
            puntosFinales = parseInt(resultadoPuntos.data.points, 10);
        }

        visitasHoy.add(passId);

        console.log(`✅ ¡Éxito! Cliente: ${nombreCliente} | Total Puntos: ${puntosFinales}`);

        res.json({
            estado: 'exito',
            nombre: nombreCliente,
            puntosTotales: puntosFinales
        });

    } catch (error) {
        console.error('💥 Error crítico:', error.message);
        res.status(500).json({ estado: 'error', mensaje: 'Error interno del servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Kiosco corriendo en: http://localhost:${PORT}`);
});