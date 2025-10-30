// src/index.js
// Cargo variables de entorno
require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

// Configuro CORS básico para API y Socket.IO; en producción puedo setear CLIENT_ORIGIN
const ORIGIN = process.env.CLIENT_ORIGIN || '*';

// Middlewares mínimos (limito payloads para evitar abusos) y CORS simple
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ORIGIN);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Sirvo archivos estáticos desde /public (primero, para que / cargue el index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta explícita para la home: garantizo que / devuelva el index.html del frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta de healthcheck; Render la usa para verificar que el servicio está operativo
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'chat-javascript', uptime: process.uptime() });
});

// (Opcional) Diagnóstico rápido de DB
app.get('/diag/db', async (_req, res) => {
  try {
    const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    if (state !== 1) return res.status(503).json({ ok: false, state, note: 'mongoose no está connected' });
    await mongoose.connection.db.admin().ping();
    res.json({ ok: true, state, note: 'ping ok' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Inicializo Socket.IO sobre el mismo server HTTP
const io = new Server(server, {
  cors: { origin: ORIGIN, methods: ['GET', 'POST'] },
});

// Enlazo mis eventos de sockets (archivo existente en el proyecto)
require('./sockets')(io);

// Puerto: Render define PORT; local uso 3000 por defecto
const PORT = process.env.PORT || 3000;

// Conexión a MongoDB
const password = process.env.DB_PASSWORD;
const FALLBACK_URI = password
  ? `mongodb+srv://admin:${encodeURIComponent(password)}@chat-database.i36q0ix.mongodb.net/?retryWrites=true&w=majority&appName=chat-database`
  : '';
const MONGODB_URI = process.env.MONGODB_URI || FALLBACK_URI;

// Arranco el server primero para que el healthcheck de Render pase
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI no está definido; el servicio corre sin DB por ahora.');
  } else {
    connectDbWithRetry();
  }
});

// Conecto a Mongo con timeout y algunos reintentos
async function connectDbWithRetry(retry = 0) {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000, // evito colgarme esperando el cluster
      dbName: process.env.MONGODB_DBNAME || 'chat-javascript', // <<< AQUI especifico base por defecto
    });
    console.log('db is connected');
    mongoose.connection.on('connected', () => console.log('mongoose connected'));
    mongoose.connection.on('error', (err) => console.error('mongoose error:', err.message));
    mongoose.connection.on('disconnected', () => console.warn('mongoose disconnected'));
  } catch (err) {
    console.error(`Fallo conectando a Mongo (intento ${retry + 1}): ${err.message}`);
    if (retry < 5) {
      setTimeout(() => connectDbWithRetry(retry + 1), 3000);
    } else {
      console.error('No pude conectar a Mongo después de varios intentos; sigo sirviendo HTTP.');
    }
  }
}

// Manejo básico de errores no capturados para que el proceso no muera silenciosamente
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});
