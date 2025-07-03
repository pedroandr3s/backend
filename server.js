const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuración de Railway MySQL usando variables de entorno
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
};
const pool = mysql.createPool(dbConfig);

app.use(cors({
  origin: [
    'https://datos-github-io-umber.vercel.app', // Tu dominio de Vercel
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:8080'
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// =============================================
// RUTAS BÁSICAS
// =============================================

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ 
        message: 'SmartBee API funcionando correctamente',
        timestamp: new Date().toISOString(),
        database: 'Railway MySQL'
    });
});

// Probar conexión a base de datos
app.get('/api/test-db', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT 1 as test, NOW() as timestamp');
        res.json({ 
            connected: true,
            test: rows[0].test,
            timestamp: rows[0].timestamp
        });
    } catch (error) {
        console.error('Error en test-db:', error);
        res.status(500).json({ 
            connected: false,
            error: error.message
        });
    }
});

// =============================================
// RUTAS PARA USUARIOS
// =============================================

// Obtener todos los usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.fecha_registro, r.descripcion as rol_descripcion 
            FROM usuario u 
            JOIN rol r ON u.rol = r.id 
            ORDER BY u.fecha_registro DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios', details: error.message });
    }
});

// Crear nuevo usuario
app.post('/api/usuarios', async (req, res) => {
    try {
        const { nombre, apellido, email, telefono, clave, rol = 2 } = req.body;
        
        // Verificar si el email ya existe
        const [existing] = await pool.execute('SELECT id FROM usuario WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }
        
        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(clave, 10);
        
        const [result] = await pool.execute(`
            INSERT INTO usuario (nombre, apellido, email, telefono, clave, rol) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [nombre, apellido, email, telefono, hashedPassword, rol]);
        
        res.json({ 
            id: result.insertId,
            message: 'Usuario creado exitosamente'
        });
    } catch (error) {
        console.error('Error creando usuario:', error);
        res.status(500).json({ error: 'Error creando usuario', details: error.message });
    }
});

// =============================================
// RUTAS PARA APIARIOS
// =============================================

// Obtener todos los apiarios
app.get('/api/apiarios', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT a.*, u.nombre as propietario_nombre, u.apellido as propietario_apellido,
                   COUNT(c.id) as total_colmenas
            FROM apiario a 
            JOIN usuario u ON a.usuario_id = u.id 
            LEFT JOIN colmena c ON c.apiario_id = a.id
            GROUP BY a.id
            ORDER BY a.fecha_creacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo apiarios:', error);
        res.status(500).json({ error: 'Error obteniendo apiarios', details: error.message });
    }
});

// Crear nuevo apiario
app.post('/api/apiarios', async (req, res) => {
    try {
        const { nombre, ubicacion, descripcion, usuario_id = 2 } = req.body;
        
        const [result] = await pool.execute(`
            INSERT INTO apiario (nombre, ubicacion, descripcion, usuario_id) 
            VALUES (?, ?, ?, ?)
        `, [nombre, ubicacion, descripcion, usuario_id]);
        
        res.json({ 
            id: result.insertId,
            message: 'Apiario creado exitosamente'
        });
    } catch (error) {
        console.error('Error creando apiario:', error);
        res.status(500).json({ error: 'Error creando apiario', details: error.message });
    }
});

// =============================================
// RUTAS PARA COLMENAS
// =============================================

// Obtener todas las colmenas
app.get('/api/colmenas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT c.*, a.nombre as apiario_nombre, u.nombre as dueno_nombre, u.apellido as dueno_apellido
            FROM colmena c 
            LEFT JOIN apiario a ON c.apiario_id = a.id 
            JOIN usuario u ON c.dueno = u.id 
            ORDER BY c.fecha_instalacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo colmenas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas', details: error.message });
    }
});

// Obtener colmenas activas para selects
app.get('/api/colmenas/activas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT id, nombre FROM colmena WHERE estado = 'activa' ORDER BY nombre
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo colmenas activas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas activas', details: error.message });
    }
});

// Crear nueva colmena
app.post('/api/colmenas', async (req, res) => {
    try {
        const { nombre, tipo, descripcion, dueno, apiario_id } = req.body;
        
        const [result] = await pool.execute(`
            INSERT INTO colmena (nombre, tipo, descripcion, dueno, apiario_id) 
            VALUES (?, ?, ?, ?, ?)
        `, [nombre, tipo, descripcion, dueno, apiario_id]);
        
        res.json({ 
            id: result.insertId,
            message: 'Colmena creada exitosamente'
        });
    } catch (error) {
        console.error('Error creando colmena:', error);
        res.status(500).json({ error: 'Error creando colmena', details: error.message });
    }
});

// =============================================
// RUTAS PARA REVISIONES
// =============================================

// Obtener todas las revisiones
app.get('/api/revisiones', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT r.*, c.nombre as colmena_nombre, u.nombre as inspector_nombre, u.apellido as inspector_apellido
            FROM revision r 
            JOIN colmena c ON r.colmena_id = c.id 
            JOIN usuario u ON r.usuario_id = u.id 
            ORDER BY r.fecha_revision DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo revisiones:', error);
        res.status(500).json({ error: 'Error obteniendo revisiones', details: error.message });
    }
});

// Crear nueva revisión
app.post('/api/revisiones', async (req, res) => {
    try {
        const { 
            colmena_id, fecha_revision, num_alzas, marcos_abejas, marcos_cria, 
            marcos_alimento, marcos_polen, presencia_varroa, condicion_reina,
            producto_sanitario, dosis_sanitario, temperatura, humedad, peso, 
            notas, usuario_id = 2 
        } = req.body;
        
        const [result] = await pool.execute(`
            INSERT INTO revision (
                colmena_id, fecha_revision, num_alzas, marcos_abejas, marcos_cria,
                marcos_alimento, marcos_polen, presencia_varroa, condicion_reina,
                producto_sanitario, dosis_sanitario, temperatura, humedad, peso,
                notas, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            colmena_id, fecha_revision, num_alzas, marcos_abejas, marcos_cria,
            marcos_alimento, marcos_polen, presencia_varroa, condicion_reina,
            producto_sanitario, dosis_sanitario, temperatura, humedad, peso,
            notas, usuario_id
        ]);
        
        res.json({ 
            id: result.insertId,
            message: 'Revisión registrada exitosamente'
        });
    } catch (error) {
        console.error('Error registrando revisión:', error);
        res.status(500).json({ error: 'Error registrando revisión', details: error.message });
    }
});

// =============================================
// RUTAS PARA DASHBOARD
// =============================================

// Obtener estadísticas del dashboard
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [usuarios] = await pool.execute('SELECT COUNT(*) as count FROM usuario');
        const [apiarios] = await pool.execute('SELECT COUNT(*) as count FROM apiario');
        const [colmenas] = await pool.execute('SELECT COUNT(*) as count FROM colmena');
        const [revisiones] = await pool.execute('SELECT COUNT(*) as count FROM revision');
        
        res.json({
            usuarios: usuarios[0].count,
            apiarios: apiarios[0].count,
            colmenas: colmenas[0].count,
            revisiones: revisiones[0].count
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas', details: error.message });
    }
});

// Obtener actividades recientes
app.get('/api/dashboard/recent', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT r.*, c.nombre as colmena_nombre, u.nombre as usuario_nombre 
            FROM revision r 
            JOIN colmena c ON r.colmena_id = c.id 
            JOIN usuario u ON r.usuario_id = u.id 
            ORDER BY r.fecha_revision DESC 
            LIMIT 4
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo actividades recientes:', error);
        res.status(500).json({ error: 'Error obteniendo actividades recientes', details: error.message });
    }
});

// =============================================
// RUTAS AUXILIARES PARA SELECTS
// =============================================

// Obtener usuarios para selects
app.get('/api/select/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre, apellido FROM usuario ORDER BY nombre');
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo usuarios para select:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios', details: error.message });
    }
});

// Obtener apiarios para selects
app.get('/api/select/apiarios', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre FROM apiario ORDER BY nombre');
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo apiarios para select:', error);
        res.status(500).json({ error: 'Error obteniendo apiarios', details: error.message });
    }
});

// =============================================
// MIDDLEWARE DE MANEJO DE ERRORES
// =============================================

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ 
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// Ruta 404
app.use('*', (req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
});

// =============================================
// INICIAR SERVIDOR
// =============================================

const startServer = async () => {
    try {
        // Probar conexión a base de datos
        console.log('🔄 Probando conexión a Railway...');
        const connection = await pool.getConnection();
        console.log('✅ Conexión exitosa a Railway MySQL');
        connection.release();
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor SmartBee ejecutándose en puerto ${PORT}`);
            console.log(`🌐 API disponible en: http://localhost:${PORT}/api`);
            console.log(`🗄️  Base de datos: Railway MySQL`);
            console.log(`📋 Endpoints principales:`);
            console.log(`   GET  /api/health - Estado del servidor`);
            console.log(`   GET  /api/test-db - Prueba de base de datos`);
            console.log(`   GET  /api/usuarios - Obtener usuarios`);
            console.log(`   POST /api/usuarios - Crear usuario`);
            console.log(`   GET  /api/apiarios - Obtener apiarios`);
            console.log(`   POST /api/apiarios - Crear apiario`);
            console.log(`   GET  /api/colmenas - Obtener colmenas`);
            console.log(`   POST /api/colmenas - Crear colmena`);
            console.log(`   GET  /api/revisiones - Obtener revisiones`);
            console.log(`   POST /api/revisiones - Crear revisión`);
            console.log(`   GET  /api/dashboard/stats - Estadísticas`);
            console.log(`   GET  /api/dashboard/recent - Actividades recientes`);
        });
    } catch (error) {
        console.error('❌ Error conectando a Railway:', error.message);
        console.log('⚠️  Iniciando servidor sin base de datos...');
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor SmartBee (modo desarrollo) en puerto ${PORT}`);
            console.log(`⚠️  Sin conexión a base de datos`);
        });
    }
};

startServer();

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('\n🔄 Cerrando servidor...');
    await pool.end();
    console.log('✅ Pool de conexiones cerrado');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Cerrando servidor...');
    await pool.end();
    console.log('✅ Pool de conexiones cerrado');
    process.exit(0);
});
