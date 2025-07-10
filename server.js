const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

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
    'https://datos-github-io-gamma.vercel.app',
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

app.get('/api/health', (req, res) => {
    res.json({ 
        message: 'SmartBee API funcionando correctamente',
        timestamp: new Date().toISOString(),
        database: 'Railway MySQL'
    });
});

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
// RUTAS DE AUTENTICACIÓN
// =============================================

app.post('/api/usuarios/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔐 Login attempt:', { email });
        
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email y contraseña son requeridos' 
            });
        }
        
        // Buscar usuario por nombre (ya que no tienes campo email en tu esquema)
        const [rows] = await pool.execute(`
            SELECT u.id, u.clave, u.nombre, u.apellido, u.rol, r.descripcion as rol_descripcion
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.nombre = ?
        `, [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        const usuario = rows[0];
        
        // Verificar contraseña (en tu esquema están en texto plano)
        const validPassword = (usuario.clave === password);
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        console.log('✅ Login exitoso:', { id: usuario.id, nombre: usuario.nombre });
        
        const token = `smartbee_${usuario.id}_${Date.now()}`;
        
        res.json({
            data: {
                token: token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    apellido: usuario.apellido,
                    email: usuario.nombre, // Usar nombre como email
                    rol_nombre: usuario.rol_descripcion || 'Usuario'
                }
            },
            message: 'Login exitoso'
        });
        
    } catch (error) {
        console.error('💥 Error en login:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor'
        });
    }
});

// =============================================
// RUTAS PARA USUARIOS
// =============================================

app.get('/api/usuarios', async (req, res) => {
    try {
        console.log('📋 Obteniendo usuarios...');
        
        const [rows] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.clave, u.rol,
                   r.descripcion as rol_nombre
            FROM usuario u 
            LEFT JOIN rol r ON u.rol = r.rol 
            ORDER BY u.id ASC
        `);
        
        // No exponer contraseñas
        const usuarios = rows.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.nombre, // Usar nombre como email temporalmente
            telefono: '', // No existe en tu esquema
            fecha_registro: new Date().toISOString(), // Temporalmente
            rol_nombre: user.rol_nombre || 'Usuario'
        }));
        
        console.log('✅ Usuarios obtenidos:', usuarios.length);
        res.json(usuarios);
    } catch (error) {
        console.error('💥 Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { nombre, apellido, clave, rol = 2 } = req.body;
        
        if (!nombre || !apellido || !clave) {
            return res.status(400).json({ error: 'Nombre, apellido y clave son obligatorios' });
        }
        
        const [result] = await pool.execute(`
            INSERT INTO usuario (nombre, apellido, clave, rol) 
            VALUES (?, ?, ?, ?)
        `, [nombre, apellido, clave, rol]);
        
        console.log('✅ Usuario creado:', result.insertId);
        res.json({ 
            id: result.insertId,
            message: 'Usuario creado exitosamente'
        });
    } catch (error) {
        console.error('💥 Error creando usuario:', error);
        res.status(500).json({ error: 'Error creando usuario' });
    }
});

// =============================================
// RUTAS PARA COLMENAS
// =============================================

app.get('/api/colmenas', async (req, res) => {
    try {
        console.log('🏠 Obteniendo colmenas...');
        
        const [rows] = await pool.execute(`
            SELECT c.id, c.descripcion, c.dueno,
                   u.nombre as dueno_nombre, u.apellido as dueno_apellido,
                   cu.latitud, cu.longitud, cu.comuna, cu.descripcion as ubicacion_descripcion
            FROM colmena c
            LEFT JOIN usuario u ON c.dueno = u.id
            LEFT JOIN colmena_ubicacion cu ON c.id = cu.colmena_id
            ORDER BY c.id ASC
        `);
        
        // Formatear para compatibilidad con frontend
        const colmenas = rows.map(colmena => ({
            id: colmena.id,
            nombre: `Colmena #${colmena.id}`, // Generar nombre basado en ID
            tipo: 'Langstroth', // Valor por defecto
            descripcion: colmena.descripcion,
            dueno: colmena.dueno,
            dueno_nombre: colmena.dueno_nombre,
            dueno_apellido: colmena.dueno_apellido,
            apiario_id: null, // No existe en tu esquema
            apiario_nombre: colmena.comuna, // Usar comuna como "apiario"
            fecha_instalacion: new Date().toISOString(), // Temporalmente
            activa: 1, // Asumir que están activas
            latitud: colmena.latitud,
            longitud: colmena.longitud,
            ubicacion: colmena.ubicacion_descripcion
        }));
        
        console.log('✅ Colmenas obtenidas:', colmenas.length);
        res.json(colmenas);
    } catch (error) {
        console.error('💥 Error obteniendo colmenas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas' });
    }
});

app.post('/api/colmenas', async (req, res) => {
    try {
        const { descripcion, dueno } = req.body;
        
        if (!descripcion || !dueno) {
            return res.status(400).json({ error: 'Descripción y dueño son obligatorios' });
        }
        
        const [result] = await pool.execute(`
            INSERT INTO colmena (descripcion, dueno) 
            VALUES (?, ?)
        `, [descripcion, dueno]);
        
        console.log('✅ Colmena creada:', result.insertId);
        res.json({ 
            id: result.insertId,
            message: 'Colmena creada exitosamente'
        });
    } catch (error) {
        console.error('💥 Error creando colmena:', error);
        res.status(500).json({ error: 'Error creando colmena' });
    }
});

// =============================================
// RUTAS PARA NODOS
// =============================================

app.get('/api/nodos', async (req, res) => {
    try {
        console.log('🔌 Obteniendo nodos...');
        
        const [rows] = await pool.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                   nt.descripcion as tipo_descripcion,
                   nu.latitud, nu.longitud, nu.comuna
            FROM nodo n
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            LEFT JOIN nodo_ubicacion nu ON n.id = nu.nodo_id
            ORDER BY n.id ASC
        `);
        
        // Formatear para frontend
        const nodos = rows.map(nodo => ({
            id: nodo.id,
            identificador: `Nodo ${nodo.id}`,
            descripcion: nodo.descripcion,
            tipo: nodo.tipo_descripcion,
            latitud: nodo.latitud,
            longitud: nodo.longitud,
            fecha_instalacion: new Date().toISOString(),
            activo: true
        }));
        
        console.log('✅ Nodos obtenidos:', nodos.length);
        res.json(nodos);
    } catch (error) {
        console.error('💥 Error obteniendo nodos:', error);
        res.status(500).json({ error: 'Error obteniendo nodos' });
    }
});

// =============================================
// RUTAS PARA MENSAJES
// =============================================

app.get('/api/mensajes/recientes', async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        
        console.log('💬 Obteniendo mensajes recientes...');
        
        const [rows] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.descripcion as nodo_descripcion
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE m.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            ORDER BY m.fecha DESC
            LIMIT 100
        `, [hours]);
        
        // Formatear para frontend
        const mensajes = rows.map(mensaje => ({
            id: mensaje.id,
            nodo_id: mensaje.nodo_id,
            nodo_identificador: mensaje.nodo_descripcion,
            topico: mensaje.topico,
            payload: mensaje.payload,
            fecha: mensaje.fecha
        }));
        
        console.log('✅ Mensajes obtenidos:', mensajes.length);
        res.json(mensajes);
    } catch (error) {
        console.error('💥 Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
});

// =============================================
// RUTAS PARA DASHBOARD
// =============================================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        console.log('📊 Obteniendo estadísticas del dashboard...');
        
        const [usuarios] = await pool.execute('SELECT COUNT(*) as count FROM usuario');
        const [colmenas] = await pool.execute('SELECT COUNT(*) as count FROM colmena');
        const [mensajesHoy] = await pool.execute(`
            SELECT COUNT(*) as count FROM mensaje 
            WHERE DATE(fecha) = CURDATE()
        `);
        
        const stats = {
            totalColmenas: colmenas[0].count,
            totalUsuarios: usuarios[0].count,
            mensajesHoy: mensajesHoy[0].count,
            colmenasActivas: colmenas[0].count // Asumir que todas están activas
        };
        
        console.log('✅ Estadísticas obtenidas:', stats);
        res.json(stats);
    } catch (error) {
        console.error('💥 Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

// =============================================
// RUTAS PARA ROLES
// =============================================

app.get('/api/roles', async (req, res) => {
    try {
        console.log('👥 Obteniendo roles...');
        
        const [rows] = await pool.execute(`
            SELECT rol as id, descripcion 
            FROM rol 
            ORDER BY rol
        `);
        
        console.log('✅ Roles obtenidos:', rows.length);
        res.json(rows);
    } catch (error) {
        console.error('💥 Error obteniendo roles:', error);
        res.status(500).json({ error: 'Error obteniendo roles' });
    }
});

// =============================================
// RUTAS PARA REVISIONES (COMPATIBILIDAD)
// =============================================

app.get('/api/revisiones', async (req, res) => {
    try {
        console.log('📝 Obteniendo revisiones...');
        
        // Como no tienes tabla de revisiones, devolver array vacío
        // pero con estructura compatible
        res.json([]);
    } catch (error) {
        console.error('💥 Error obteniendo revisiones:', error);
        res.status(500).json({ error: 'Error obteniendo revisiones' });
    }
});

app.post('/api/revisiones', async (req, res) => {
    try {
        // Placeholder para crear revisiones
        res.json({ 
            message: 'Funcionalidad de revisiones pendiente de implementación',
            id: Date.now()
        });
    } catch (error) {
        console.error('💥 Error creando revisión:', error);
        res.status(500).json({ error: 'Error creando revisión' });
    }
});

// =============================================
// RUTAS AUXILIARES
// =============================================

app.get('/api/select/usuarios', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre, apellido FROM usuario ORDER BY nombre');
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo usuarios para select:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

app.get('/api/colmenas/activas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT id, CONCAT('Colmena #', id) as nombre FROM colmena ORDER BY id
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo colmenas activas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas activas' });
    }
});

// =============================================
// RUTA DE DEBUG (TEMPORAL)
// =============================================

app.get('/api/debug/estructura', async (req, res) => {
    try {
        const [tables] = await pool.execute('SHOW TABLES');
        
        let estructura = { tablas: tables };
        
        // Obtener estructura de cada tabla
        for (const table of tables) {
            const tableName = table[Object.keys(table)[0]];
            try {
                const [columns] = await pool.execute(`DESCRIBE ${tableName}`);
                estructura[tableName] = columns;
            } catch (e) {
                estructura[`${tableName}_error`] = e.message;
            }
        }
        
        res.json(estructura);
    } catch (error) {
        res.status(500).json({ error: error.message });
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

app.use('*', (req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
});

// =============================================
// INICIAR SERVIDOR
// =============================================

const startServer = async () => {
    try {
        console.log('🔄 Probando conexión a Railway...');
        const connection = await pool.getConnection();
        console.log('✅ Conexión exitosa a Railway MySQL');
        connection.release();
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor SmartBee ejecutándose en puerto ${PORT}`);
            console.log(`🌐 API disponible en: http://localhost:${PORT}/api`);
            console.log(`🗄️  Base de datos: Railway MySQL`);
            console.log(`📋 Endpoints disponibles:`);
            console.log(`   ✅ GET  /api/health`);
            console.log(`   ✅ GET  /api/test-db`);
            console.log(`   ✅ POST /api/usuarios/login`);
            console.log(`   ✅ GET  /api/usuarios`);
            console.log(`   ✅ GET  /api/colmenas`);
            console.log(`   ✅ GET  /api/nodos`);
            console.log(`   ✅ GET  /api/mensajes/recientes`);
            console.log(`   ✅ GET  /api/dashboard/stats`);
            console.log(`   ✅ GET  /api/roles`);
            console.log(`   ✅ GET  /api/debug/estructura`);
        });
    } catch (error) {
        console.error('❌ Error conectando a Railway:', error.message);
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor SmartBee (modo desarrollo) en puerto ${PORT}`);
            console.log(`⚠️  Sin conexión a base de datos`);
        });
    }
};

startServer();

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
