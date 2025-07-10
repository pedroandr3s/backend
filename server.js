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
// AGREGA ESTA RUTA TEMPORAL A TU server.js (antes de las otras rutas)

// =============================================
// RUTA DE DEBUG - REMOVER DESPUÉS 
// =============================================
app.get('/api/debug/database', async (req, res) => {
    try {
        console.log('🔍 Iniciando debug de base de datos...');
        
        // Test 1: Conexión básica
        const [testConnection] = await pool.execute('SELECT 1 as test');
        console.log('✅ Conexión a BD exitosa');
        
        // Test 2: Verificar qué tablas existen
        const [tables] = await pool.execute('SHOW TABLES');
        console.log('📋 Tablas disponibles:', tables);
        
        // Test 3: Estructura de cada tabla principal
        let structures = {};
        
        try {
            const [colmenaStruct] = await pool.execute('DESCRIBE colmena');
            structures.colmena = colmenaStruct;
            console.log('🏠 Estructura tabla colmena:', colmenaStruct);
        } catch (e) {
            console.log('❌ Error tabla colmena:', e.message);
            structures.colmena_error = e.message;
        }
        
        try {
            const [usuarioStruct] = await pool.execute('DESCRIBE usuario');
            structures.usuario = usuarioStruct;
            console.log('👤 Estructura tabla usuario:', usuarioStruct);
        } catch (e) {
            console.log('❌ Error tabla usuario:', e.message);
            structures.usuario_error = e.message;
        }
        
        try {
            const [apiarioStruct] = await pool.execute('DESCRIBE apiario');
            structures.apiario = apiarioStruct;
            console.log('🏢 Estructura tabla apiario:', apiarioStruct);
        } catch (e) {
            console.log('❌ Error tabla apiario:', e.message);
            structures.apiario_error = e.message;
        }
        
        try {
            const [mensajeStruct] = await pool.execute('DESCRIBE mensaje');
            structures.mensaje = mensajeStruct;
            console.log('💬 Estructura tabla mensaje:', mensajeStruct);
        } catch (e) {
            console.log('❌ Error tabla mensaje:', e.message);
            structures.mensaje_error = e.message;
        }
        
        // Test 4: Contar registros en cada tabla
        let counts = {};
        
        try {
            const [colmenaCount] = await pool.execute('SELECT COUNT(*) as count FROM colmena');
            counts.colmena = colmenaCount[0].count;
        } catch (e) {
            counts.colmena_error = e.message;
        }
        
        try {
            const [usuarioCount] = await pool.execute('SELECT COUNT(*) as count FROM usuario');
            counts.usuario = usuarioCount[0].count;
        } catch (e) {
            counts.usuario_error = e.message;
        }
        
        try {
            const [apiarioCount] = await pool.execute('SELECT COUNT(*) as count FROM apiario');
            counts.apiario = apiarioCount[0].count;
        } catch (e) {
            counts.apiario_error = e.message;
        }
        
        // Test 5: Probar query simple de colmenas
        let sampleData = {};
        
        try {
            const [simpleCols] = await pool.execute('SELECT * FROM colmena LIMIT 1');
            sampleData.colmena_sample = simpleCols[0] || 'No hay datos';
            console.log('📊 Datos muestra colmena:', simpleCols[0]);
        } catch (e) {
            console.log('❌ Error query simple colmena:', e.message);
            sampleData.colmena_error = e.message;
        }
        
        try {
            const [simpleUsers] = await pool.execute('SELECT * FROM usuario LIMIT 1');
            sampleData.usuario_sample = simpleUsers[0] || 'No hay datos';
            console.log('📊 Datos muestra usuario:', simpleUsers[0]);
        } catch (e) {
            console.log('❌ Error query simple usuario:', e.message);
            sampleData.usuario_error = e.message;
        }
        
        const result = {
            connection_test: testConnection[0],
            available_tables: tables,
            table_structures: structures,
            record_counts: counts,
            sample_data: sampleData,
            timestamp: new Date().toISOString()
        };
        
        console.log('🎯 Debug completo:', JSON.stringify(result, null, 2));
        
        res.json(result);
        
    } catch (error) {
        console.error('💥 Error completo en debug:', error);
        res.status(500).json({ 
            error: error.message,
            stack: error.stack 
        });
    }
});

// Test específico para colmenas con error detallado
app.get('/api/debug/colmenas-detailed', async (req, res) => {
    try {
        console.log('🔍 Debug detallado de colmenas...');
        
        // Query más simple primero
        console.log('Paso 1: Query básica SELECT * FROM colmena');
        const [basicColmenas] = await pool.execute('SELECT * FROM colmena LIMIT 5');
        console.log('✅ Query básica exitosa:', basicColmenas);
        
        // Verificar si existe tabla apiario
        console.log('Paso 2: Verificando tabla apiario');
        const [apiarioTest] = await pool.execute('SELECT * FROM apiario LIMIT 1');
        console.log('✅ Tabla apiario existe:', apiarioTest);
        
        // Probar JOIN simple
        console.log('Paso 3: Probando JOIN con apiario');
        const [joinTest] = await pool.execute(`
            SELECT c.id, c.nombre, a.nombre as apiario_nombre
            FROM colmena c 
            LEFT JOIN apiario a ON c.apiario_id = a.id 
            LIMIT 1
        `);
        console.log('✅ JOIN con apiario exitoso:', joinTest);
        
        // Probar query completa
        console.log('Paso 4: Query completa como en el código');
        const [fullQuery] = await pool.execute(`
            SELECT c.id, c.nombre, c.tipo, c.descripcion, c.dueno, c.apiario_id,
                   c.fecha_instalacion, c.activa,
                   a.nombre as apiario_nombre, 
                   u.nombre as dueno_nombre, u.apellido as dueno_apellido
            FROM colmena c 
            LEFT JOIN apiario a ON c.apiario_id = a.id 
            LEFT JOIN usuario u ON c.dueno = u.id 
            ORDER BY c.fecha_instalacion DESC
            LIMIT 5
        `);
        console.log('✅ Query completa exitosa:', fullQuery);
        
        res.json({
            basic_colmenas: basicColmenas,
            apiario_test: apiarioTest,
            join_test: joinTest,
            full_query: fullQuery
        });
        
    } catch (error) {
        console.error('💥 Error en debug colmenas:', error);
        res.status(500).json({ 
            error: error.message,
            sql: error.sql,
            errno: error.errno,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
    }
});
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
        
        // Buscar usuario
        const [rows] = await pool.execute(`
            SELECT id, nombre, apellido, email, telefono, clave, fecha_registro, rol
            FROM usuario 
            WHERE email = ?
        `, [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        const usuario = rows[0];
        
        // Verificar contraseña
        let validPassword = false;
        try {
            if (usuario.clave) {
                validPassword = await bcrypt.compare(password, usuario.clave);
            }
        } catch (bcryptError) {
            // Fallback para contraseñas en texto plano
            if (usuario.clave === password) {
                validPassword = true;
                // Actualizar a hash para seguridad
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.execute('UPDATE usuario SET clave = ? WHERE id = ?', [hashedPassword, usuario.id]);
            }
        }
        
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Credenciales inválidas' 
            });
        }
        
        // Obtener rol
        let rol_nombre = 'Usuario';
        try {
            const [rolRows] = await pool.execute('SELECT descripcion FROM rol WHERE id = ?', [usuario.rol]);
            if (rolRows.length > 0) {
                rol_nombre = rolRows[0].descripcion;
            }
        } catch (rolError) {
            console.log('⚠️ No se pudo obtener rol');
        }
        
        console.log('✅ Login exitoso:', { id: usuario.id, email: usuario.email });
        
        const { clave, ...usuarioSinClave } = usuario;
        usuarioSinClave.rol_nombre = rol_nombre;
        
        const token = `smartbee_${usuario.id}_${Date.now()}`;
        
        res.json({
            data: {
                token: token,
                usuario: usuarioSinClave
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
        const [rows] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.email, u.telefono, u.fecha_registro, 
                   COALESCE(r.descripcion, 'Usuario') as rol_nombre 
            FROM usuario u 
            LEFT JOIN rol r ON u.rol = r.id 
            ORDER BY u.fecha_registro DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { nombre, apellido, email, telefono, clave, rol = 2 } = req.body;
        
        const [existing] = await pool.execute('SELECT id FROM usuario WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }
        
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
        res.status(500).json({ error: 'Error creando usuario' });
    }
});

// =============================================
// RUTAS PARA COLMENAS
// =============================================

app.get('/api/colmenas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT c.id, c.nombre, c.tipo, c.descripcion, c.dueno, c.apiario_id,
                   c.fecha_instalacion, c.activa,
                   a.nombre as apiario_nombre, 
                   u.nombre as dueno_nombre, u.apellido as dueno_apellido
            FROM colmena c 
            LEFT JOIN apiario a ON c.apiario_id = a.id 
            LEFT JOIN usuario u ON c.dueno = u.id 
            ORDER BY c.fecha_instalacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo colmenas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas' });
    }
});

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
        res.status(500).json({ error: 'Error creando colmena' });
    }
});

// =============================================
// RUTAS PARA NODOS
// =============================================

app.get('/api/nodos', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT n.id, n.identificador, n.descripcion, n.latitud, n.longitud,
                   n.fecha_instalacion, n.activo
            FROM nodo n 
            ORDER BY n.fecha_instalacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo nodos:', error);
        res.status(500).json({ error: 'Error obteniendo nodos' });
    }
});

app.post('/api/nodos', async (req, res) => {
    try {
        const { identificador, descripcion, latitud, longitud } = req.body;
        
        const [result] = await pool.execute(`
            INSERT INTO nodo (identificador, descripcion, latitud, longitud) 
            VALUES (?, ?, ?, ?)
        `, [identificador, descripcion, latitud, longitud]);
        
        res.json({ 
            id: result.insertId,
            message: 'Nodo creado exitosamente'
        });
    } catch (error) {
        console.error('Error creando nodo:', error);
        res.status(500).json({ error: 'Error creando nodo' });
    }
});

// =============================================
// RUTAS PARA MENSAJES DE SENSORES
// =============================================

app.get('/api/mensajes/recientes', async (req, res) => {
    try {
        const { hours = 24 } = req.query;
        
        // Obtener mensajes reales de la tabla mensaje
        const [rows] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.identificador as nodo_identificador
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE m.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            ORDER BY m.fecha DESC
            LIMIT 100
        `, [hours]);
        
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo mensajes:', error);
        res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
});

// =============================================
// RUTAS PARA ROLES
// =============================================

app.get('/api/roles', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT id, descripcion 
            FROM rol 
            ORDER BY id
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo roles:', error);
        res.status(500).json({ error: 'Error obteniendo roles' });
    }
});

// =============================================
// RUTAS PARA DASHBOARD
// =============================================

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [usuarios] = await pool.execute('SELECT COUNT(*) as count FROM usuario');
        const [colmenas] = await pool.execute('SELECT COUNT(*) as count FROM colmena');
        const [colmenasActivas] = await pool.execute('SELECT COUNT(*) as count FROM colmena WHERE activa = 1');
        const [mensajesHoy] = await pool.execute(`
            SELECT COUNT(*) as count FROM mensaje 
            WHERE DATE(fecha) = CURDATE()
        `);
        
        res.json({
            totalColmenas: colmenas[0].count,
            totalUsuarios: usuarios[0].count,
            mensajesHoy: mensajesHoy[0].count,
            colmenasActivas: colmenasActivas[0].count
        });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

// =============================================
// RUTAS PARA APIARIOS
// =============================================

app.get('/api/apiarios', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT a.*, u.nombre as propietario_nombre, u.apellido as propietario_apellido,
                   COUNT(c.id) as total_colmenas
            FROM apiario a 
            LEFT JOIN usuario u ON a.usuario_id = u.id 
            LEFT JOIN colmena c ON c.apiario_id = a.id
            GROUP BY a.id
            ORDER BY a.fecha_creacion DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo apiarios:', error);
        res.status(500).json({ error: 'Error obteniendo apiarios' });
    }
});

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
        res.status(500).json({ error: 'Error creando apiario' });
    }
});

// =============================================
// RUTAS PARA REVISIONES
// =============================================

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
        res.status(500).json({ error: 'Error obteniendo revisiones' });
    }
});

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
        res.status(500).json({ error: 'Error registrando revisión' });
    }
});

// =============================================
// RUTAS AUXILIARES PARA SELECTS
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

app.get('/api/select/apiarios', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT id, nombre FROM apiario ORDER BY nombre');
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo apiarios para select:', error);
        res.status(500).json({ error: 'Error obteniendo apiarios' });
    }
});

app.get('/api/colmenas/activas', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT id, nombre FROM colmena WHERE activa = 1 ORDER BY nombre
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo colmenas activas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas activas' });
    }
});

// =============================================
// RUTAS DE UTILIDAD PARA DESARROLLO
// =============================================

app.post('/api/crear-usuario-prueba', async (req, res) => {
    try {
        console.log('🧪 Creando usuario de prueba...');
        
        const [existing] = await pool.execute('SELECT id FROM usuario WHERE email = ?', ['admin']);
        if (existing.length > 0) {
            return res.json({ 
                message: 'Usuario admin ya existe',
                credentials: { email: 'admin', password: 'admin123' }
            });
        }
        
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        let rolId = 1;
        try {
            const [roles] = await pool.execute('SELECT id FROM rol LIMIT 1');
            if (roles.length > 0) {
                rolId = roles[0].id;
            }
        } catch (rolError) {
            rolId = null;
        }
        
        const [result] = await pool.execute(`
            INSERT INTO usuario (nombre, apellido, email, telefono, clave, rol) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, ['Admin', 'SmartBee', 'admin', '+56912345678', hashedPassword, rolId]);
        
        res.json({ 
            id: result.insertId,
            message: 'Usuario de prueba creado exitosamente',
            credentials: { 
                email: 'admin', 
                password: 'admin123' 
            }
        });
        
    } catch (error) {
        console.error('💥 Error creando usuario de prueba:', error);
        res.status(500).json({ 
            error: 'Error creando usuario de prueba'
        });
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
            console.log(`📋 Endpoints principales:`);
            console.log(`   GET  /api/health - Estado del servidor`);
            console.log(`   POST /api/usuarios/login - Login`);
            console.log(`   GET  /api/usuarios - Obtener usuarios`);
            console.log(`   GET  /api/colmenas - Obtener colmenas`);
            console.log(`   GET  /api/nodos - Obtener nodos`);
            console.log(`   GET  /api/mensajes/recientes - Mensajes de sensores`);
            console.log(`   GET  /api/dashboard/stats - Estadísticas`);
            console.log(`   GET  /api/roles - Obtener roles`);
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
