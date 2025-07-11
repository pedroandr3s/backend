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
        
        // CORREGIDO: Ahora incluimos tanto el rol (ID) como el rol_nombre
        const usuarios = rows.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            email: user.nombre, // Usar nombre como email temporalmente
            telefono: '', // No existe en tu esquema
            fecha_registro: new Date().toISOString(), // Temporalmente
            rol: user.rol, // ✅ AGREGADO: ID del rol (1, 2, 3)
            rol_nombre: user.rol_nombre || 'Usuario' // ✅ MANTENIDO: Nombre del rol
        }));
        
        console.log('✅ Usuarios obtenidos:', usuarios.length);
        console.log('🔍 Primer usuario con rol:', usuarios[0]); // Debug
        res.json(usuarios);
    } catch (error) {
        console.error('💥 Error obteniendo usuarios:', error);
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

// REEMPLAZA el endpoint POST /api/usuarios en tu server.js con este:

app.post('/api/usuarios', async (req, res) => {
    try {
        console.log('📝 Creando usuario con datos:', req.body);
        
        // Extraer campos del frontend y mapear a tu esquema
        const { 
            nombre, 
            apellido, 
            email,        // El frontend envía email, pero usamos como nombre si no hay nombre
            password,     // El frontend envía password, mapeamos a clave
            clave,        // O puede enviar clave directamente
            rol = 2       // Por defecto rol 2 (Apicultor)
        } = req.body;
        
        // Determinar valores finales
        const nombreFinal = nombre || email || 'Usuario';
        const apellidoFinal = apellido || 'Apellido';
        const claveFinal = clave || password || '1234';
        
        console.log('📝 Datos procesados:', {
            nombre: nombreFinal,
            apellido: apellidoFinal,
            clave: claveFinal,
            rol: rol
        });
        
        // Validar campos requeridos
        if (!nombreFinal || !apellidoFinal || !claveFinal) {
            return res.status(400).json({ 
                error: 'Nombre, apellido y contraseña son obligatorios',
                received: req.body
            });
        }
        
        // Verificar que el rol existe
        const [rolExists] = await pool.execute('SELECT rol FROM rol WHERE rol = ?', [rol]);
        if (rolExists.length === 0) {
            console.log('⚠️ Rol no existe, usando rol 2 por defecto');
            rol = 2;
        }
        
        // Insertar usuario
        const [result] = await pool.execute(`
            INSERT INTO usuario (nombre, apellido, clave, rol) 
            VALUES (?, ?, ?, ?)
        `, [nombreFinal, apellidoFinal, claveFinal, rol]);
        
        console.log('✅ Usuario creado exitosamente:', result.insertId);
        
        // Obtener el usuario creado para devolverlo
        const [newUser] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.rol,
                   r.descripcion as rol_nombre
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.id = ?
        `, [result.insertId]);
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Usuario creado exitosamente',
            usuario: {
                id: newUser[0].id,
                nombre: newUser[0].nombre,
                apellido: newUser[0].apellido,
                email: newUser[0].nombre, // Mapear nombre a email para frontend
                telefono: '', // No existe en tu esquema
                fecha_registro: new Date().toISOString(),
                rol_nombre: newUser[0].rol_nombre || 'Usuario'
            }
        });
        
    } catch (error) {
        console.error('💥 Error creando usuario:', error);
        
        // Log detallado del error
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sql: error.sql
        });
        
        res.status(500).json({ 
            error: 'Error creando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});
app.put('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, apellido, clave, rol } = req.body;
        
        console.log(`✏️ Actualizando usuario ${id}:`, req.body);
        
        // Verificar que el usuario existe
        const [userExists] = await pool.execute('SELECT id FROM usuario WHERE id = ?', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Validar campos requeridos
        if (!nombre || !apellido || !rol) {
            return res.status(400).json({ 
                error: 'Nombre, apellido y rol son obligatorios' 
            });
        }
        
        // Verificar que el rol existe
        const [rolExists] = await pool.execute('SELECT rol FROM rol WHERE rol = ?', [rol]);
        if (rolExists.length === 0) {
            return res.status(400).json({ error: 'El rol especificado no existe' });
        }
        
        // Preparar la consulta de actualización
        let updateQuery;
        let updateParams;
        
        if (clave && clave.trim()) {
            // Actualizar con nueva clave
            updateQuery = `
                UPDATE usuario 
                SET nombre = ?, apellido = ?, clave = ?, rol = ?
                WHERE id = ?
            `;
            updateParams = [nombre.trim(), apellido.trim(), clave.trim(), parseInt(rol), id];
        } else {
            // Actualizar sin cambiar la clave
            updateQuery = `
                UPDATE usuario 
                SET nombre = ?, apellido = ?, rol = ?
                WHERE id = ?
            `;
            updateParams = [nombre.trim(), apellido.trim(), parseInt(rol), id];
        }
        
        // Ejecutar actualización
        await pool.execute(updateQuery, updateParams);
        
        console.log('✅ Usuario actualizado:', id);
        
        // Obtener el usuario actualizado para devolverlo
        const [updatedUser] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.rol,
                   r.descripcion as rol_nombre
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.id = ?
        `, [id]);
        
        res.json({ 
            message: 'Usuario actualizado correctamente',
            usuario: {
                id: updatedUser[0].id,
                nombre: updatedUser[0].nombre,
                apellido: updatedUser[0].apellido,
                email: updatedUser[0].nombre, // Mapear nombre a email para frontend
                telefono: '', // No existe en tu esquema
                fecha_registro: new Date().toISOString(),
                rol_nombre: updatedUser[0].rol_nombre || 'Usuario',
                rol: updatedUser[0].rol
            }
        });
        
    } catch (error) {
        console.error('💥 Error actualizando usuario:', error);
        res.status(500).json({ 
            error: 'Error actualizando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});

// DELETE - Eliminar usuario
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando usuario ${id}`);
        
        // Verificar que el usuario existe
        const [userExists] = await pool.execute('SELECT id, nombre, apellido FROM usuario WHERE id = ?', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const usuario = userExists[0];
        
        // Verificar si el usuario tiene colmenas asociadas
        const [colmenasAsociadas] = await pool.execute('SELECT COUNT(*) as count FROM colmena WHERE dueno = ?', [id]);
        
        if (colmenasAsociadas[0].count > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar el usuario porque tiene ${colmenasAsociadas[0].count} colmena(s) asociada(s). Primero transfiere o elimina las colmenas.`
            });
        }
        
        // Eliminar usuario
        await pool.execute('DELETE FROM usuario WHERE id = ?', [id]);
        
        console.log('✅ Usuario eliminado:', id);
        res.json({ 
            message: `Usuario "${usuario.nombre} ${usuario.apellido}" eliminado correctamente`,
            id: parseInt(id)
        });
        
    } catch (error) {
        console.error('💥 Error eliminando usuario:', error);
        
        // Error específico para foreign key constraint
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ 
                error: 'No se puede eliminar el usuario porque tiene registros asociados (colmenas, etc.)'
            });
        }
        
        res.status(500).json({ 
            error: 'Error eliminando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});

// GET - Obtener un usuario específico (opcional, útil para debug)
app.get('/api/usuarios/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Obteniendo usuario ${id}`);
        
        const [rows] = await pool.execute(`
            SELECT u.id, u.nombre, u.apellido, u.clave, u.rol,
                   r.descripcion as rol_nombre
            FROM usuario u 
            LEFT JOIN rol r ON u.rol = r.rol 
            WHERE u.id = ?
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const usuario = {
            id: rows[0].id,
            nombre: rows[0].nombre,
            apellido: rows[0].apellido,
            email: rows[0].nombre, // Usar nombre como email temporalmente
            telefono: '', // No existe en tu esquema
            fecha_registro: new Date().toISOString(), // Temporalmente
            rol_nombre: rows[0].rol_nombre || 'Usuario',
            rol: rows[0].rol
        };
        
        console.log('✅ Usuario obtenido:', usuario);
        res.json(usuario);
        
    } catch (error) {
        console.error('💥 Error obteniendo usuario:', error);
        res.status(500).json({ error: 'Error obteniendo usuario' });
    }
});
// TAMBIÉN AGREGA este endpoint para debug de logs en tiempo real:
app.get('/api/debug/logs', (req, res) => {
    res.json({
        message: 'Endpoint para debug. Revisa los logs del servidor.',
        timestamp: new Date().toISOString()
    });
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

// ASEGÚRATE DE QUE TIENES ESTE ENDPOINT EN TU server.js
// (debe estar ANTES de los endpoints con parámetros como /:id)

// =============================================
// RUTAS PARA COLMENAS - ORDEN IMPORTANTE
// =============================================

// GET - Obtener todas las colmenas (YA LO TIENES)
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
            ubicacion: colmena.ubicacion_descripcion,
            comuna: colmena.comuna,
            ubicacion_descripcion: colmena.ubicacion_descripcion
        }));
        
        console.log('✅ Colmenas obtenidas:', colmenas.length);
        res.json(colmenas);
    } catch (error) {
        console.error('💥 Error obteniendo colmenas:', error);
        res.status(500).json({ error: 'Error obteniendo colmenas' });
    }
});

// POST - Crear nueva colmena (ESTE ES EL QUE FALTA)
app.post('/api/colmenas', async (req, res) => {
    try {
        console.log('➕ Creando nueva colmena con datos:', req.body);
        
        const { descripcion, dueno } = req.body;
        
        // Validar campos requeridos
        if (!descripcion || !dueno) {
            return res.status(400).json({ 
                error: 'Descripción y dueño son obligatorios' 
            });
        }
        
        // Verificar que el dueño existe
        const [duenoExists] = await pool.execute('SELECT id FROM usuario WHERE id = ?', [dueno]);
        if (duenoExists.length === 0) {
            return res.status(400).json({ error: 'El usuario dueño no existe' });
        }
        
        // Insertar nueva colmena
        const [result] = await pool.execute(`
            INSERT INTO colmena (descripcion, dueno) 
            VALUES (?, ?)
        `, [descripcion.trim(), parseInt(dueno)]);
        
        console.log('✅ Colmena creada exitosamente:', result.insertId);
        
        // Devolver la colmena creada con formato completo
        const nuevaColmena = {
            id: result.insertId,
            descripcion: descripcion.trim(),
            dueno: parseInt(dueno),
            message: 'Colmena creada exitosamente'
        };
        
        res.status(201).json(nuevaColmena);
        
    } catch (error) {
        console.error('💥 Error creando colmena:', error);
        res.status(500).json({ 
            error: 'Error creando colmena',
            details: error.message 
        });
    }
});

// IMPORTANTE: Los endpoints con parámetros (:id) deben ir DESPUÉS
// GET - Obtener detalle completo de una colmena
app.get('/api/colmenas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Obteniendo detalle de colmena ${id}`);
        
        // Obtener información básica de la colmena
        const [colmenaData] = await pool.execute(`
            SELECT c.id, c.descripcion, c.dueno,
                   u.nombre as dueno_nombre, u.apellido as dueno_apellido
            FROM colmena c
            LEFT JOIN usuario u ON c.dueno = u.id
            WHERE c.id = ?
        `, [id]);
        
        if (colmenaData.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Obtener ubicación
        const [ubicacionData] = await pool.execute(`
            SELECT latitud, longitud, descripcion as ubicacion_descripcion, comuna
            FROM colmena_ubicacion 
            WHERE colmena_id = ?
            ORDER BY fecha DESC
            LIMIT 1
        `, [id]);
        
        // Obtener nodos asociados
        const [nodosData] = await pool.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                   nt.descripcion as tipo_descripcion
            FROM nodo_colmena nc
            JOIN nodo n ON nc.nodo_id = n.id
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            WHERE nc.colmena_id = ?
        `, [id]);
        
        const colmenaCompleta = {
            ...colmenaData[0],
            ...(ubicacionData[0] || {}),
            nodos: nodosData
        };
        
        console.log('✅ Detalle de colmena obtenido:', colmenaCompleta);
        res.json(colmenaCompleta);
        
    } catch (error) {
        console.error('💥 Error obteniendo detalle de colmena:', error);
        res.status(500).json({ error: 'Error obteniendo detalle de colmena' });
    }
});

// PUT - Actualizar colmena
app.put('/api/colmenas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { descripcion, dueno } = req.body;
        
        console.log(`✏️ Actualizando colmena ${id}:`, req.body);
        
        // Verificar que la colmena existe
        const [colmenaExists] = await pool.execute('SELECT id FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Actualizar colmena
        await pool.execute(`
            UPDATE colmena 
            SET descripcion = ?, dueno = ?
            WHERE id = ?
        `, [descripcion, dueno, id]);
        
        console.log('✅ Colmena actualizada:', id);
        res.json({ 
            message: 'Colmena actualizada correctamente',
            id: parseInt(id)
        });
        
    } catch (error) {
        console.error('💥 Error actualizando colmena:', error);
        res.status(500).json({ error: 'Error actualizando colmena' });
    }
});

// DELETE - Eliminar colmena
app.delete('/api/colmenas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando colmena ${id}`);
        
        // Verificar que la colmena existe
        const [colmenaExists] = await pool.execute('SELECT id FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Eliminar en orden (por las foreign keys)
        await pool.execute('DELETE FROM nodo_colmena WHERE colmena_id = ?', [id]);
        await pool.execute('DELETE FROM colmena_ubicacion WHERE colmena_id = ?', [id]);
        await pool.execute('DELETE FROM colmena WHERE id = ?', [id]);
        
        console.log('✅ Colmena eliminada:', id);
        res.json({ 
            message: 'Colmena eliminada correctamente',
            id: parseInt(id)
        });
        
    } catch (error) {
        console.error('💥 Error eliminando colmena:', error);
        res.status(500).json({ error: 'Error eliminando colmena' });
    }
});
app.post('/api/colmenas/:id/ubicaciones', async (req, res) => {
    try {
        const { id } = req.params;
        const { latitud, longitud, descripcion, comuna } = req.body;
        
        console.log(`📍 Agregando ubicación a colmena ${id}:`, req.body);
        
        // Verificar que la colmena existe
        const [colmenaExists] = await pool.execute('SELECT id FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Validar campos requeridos
        if (!latitud || !longitud) {
            return res.status(400).json({ error: 'Latitud y longitud son requeridos' });
        }
        
        // Verificar si ya existe una ubicación para esta colmena
        const [existingLocation] = await pool.execute(
            'SELECT id FROM colmena_ubicacion WHERE colmena_id = ?', 
            [id]
        );
        
        if (existingLocation.length > 0) {
            // Actualizar ubicación existente
            await pool.execute(`
                UPDATE colmena_ubicacion 
                SET latitud = ?, longitud = ?, descripcion = ?, comuna = ?, fecha = CURRENT_TIMESTAMP
                WHERE colmena_id = ?
            `, [latitud, longitud, descripcion || null, comuna || null, id]);
            
            console.log('✅ Ubicación actualizada para colmena:', id);
        } else {
            // Crear nueva ubicación
            await pool.execute(`
                INSERT INTO colmena_ubicacion (colmena_id, latitud, longitud, descripcion, comuna) 
                VALUES (?, ?, ?, ?, ?)
            `, [id, latitud, longitud, descripcion || null, comuna || null]);
            
            console.log('✅ Nueva ubicación creada para colmena:', id);
        }
        
        res.json({ 
            message: 'Ubicación agregada/actualizada correctamente',
            colmena_id: id
        });
        
    } catch (error) {
        console.error('💥 Error agregando ubicación:', error);
        res.status(500).json({ 
            error: 'Error agregando ubicación',
            details: error.message 
        });
    }
}); // ✅ CERRAR CORRECTAMENTE AQUÍ

// GET - Obtener nodos asociados a una colmena específica
app.get('/api/colmenas/:id/nodos', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔌 Obteniendo nodos para colmena ${id}`);
        
        // Verificar que la colmena existe
        const [colmenaExists] = await pool.execute('SELECT id FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Obtener nodos asociados a esta colmena
        const [nodos] = await pool.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                   nt.descripcion as tipo_descripcion,
                   nc.fecha as fecha_asociacion
            FROM nodo_colmena nc
            JOIN nodo n ON nc.nodo_id = n.id
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            WHERE nc.colmena_id = ?
            ORDER BY nc.fecha DESC
        `, [id]);
        
        console.log(`✅ Nodos encontrados para colmena ${id}:`, nodos.length);
        res.json(nodos);
        
    } catch (error) {
        console.error('💥 Error obteniendo nodos de colmena:', error);
        res.status(500).json({ 
            error: 'Error obteniendo nodos de la colmena',
            details: error.message 
        });
    }
});

// GET - Obtener ubicaciones específicas de una colmena
app.get('/api/colmenas/:id/ubicaciones', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`📍 Obteniendo ubicaciones para colmena ${id}`);
        
        const [ubicaciones] = await pool.execute(`
            SELECT id, latitud, longitud, descripcion, comuna, fecha
            FROM colmena_ubicacion 
            WHERE colmena_id = ?
            ORDER BY fecha DESC
        `, [id]);
        
        console.log(`✅ Ubicaciones encontradas para colmena ${id}:`, ubicaciones.length);
        res.json(ubicaciones);
        
    } catch (error) {
        console.error('💥 Error obteniendo ubicaciones:', error);
        res.status(500).json({ 
            error: 'Error obteniendo ubicaciones',
            details: error.message 
        });
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
app.get('/api/nodo-tipos', async (req, res) => {
    try {
        console.log('🔧 Obteniendo tipos de nodos...');
        
        const [rows] = await pool.execute(`
            SELECT tipo, descripcion 
            FROM nodo_tipo 
            ORDER BY tipo ASC
        `);
        
        // Formatear para compatibilidad con frontend
        const nodoTipos = rows.map(tipo => ({
            id: tipo.tipo,           // Para compatibilidad
            tipo: tipo.tipo,         // ID original
            descripcion: tipo.descripcion
        }));
        
        console.log('✅ Tipos de nodos obtenidos:', nodoTipos.length);
        res.json(nodoTipos);
    } catch (error) {
        console.error('💥 Error obteniendo tipos de nodos:', error);
        res.status(500).json({ error: 'Error obteniendo tipos de nodos' });
    }
});

// POST - Crear nuevo tipo de nodo (opcional)
app.post('/api/nodo-tipos', async (req, res) => {
    try {
        const { descripcion } = req.body;
        
        console.log('➕ Creando nuevo tipo de nodo:', { descripcion });
        
        if (!descripcion || !descripcion.trim()) {
            return res.status(400).json({ 
                error: 'La descripción es requerida' 
            });
        }
        
        // Insertar nuevo tipo de nodo
        const [result] = await pool.execute(`
            INSERT INTO nodo_tipo (descripcion) 
            VALUES (?)
        `, [descripcion.trim()]);
        
        console.log('✅ Tipo de nodo creado exitosamente:', result.insertId);
        
        res.status(201).json({ 
            id: result.insertId,
            tipo: result.insertId,
            descripcion: descripcion.trim(),
            message: 'Tipo de nodo creado exitosamente'
        });
        
    } catch (error) {
        console.error('💥 Error creando tipo de nodo:', error);
        res.status(500).json({ 
            error: 'Error creando tipo de nodo',
            details: error.message 
        });
    }
});

// PUT - Actualizar tipo de nodo (opcional)
app.put('/api/nodo-tipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { descripcion } = req.body;
        
        console.log(`✏️ Actualizando tipo de nodo ${id}:`, { descripcion });
        
        // Verificar que el tipo de nodo existe
        const [tipoExists] = await pool.execute('SELECT tipo FROM nodo_tipo WHERE tipo = ?', [id]);
        if (tipoExists.length === 0) {
            return res.status(404).json({ error: 'Tipo de nodo no encontrado' });
        }
        
        if (!descripcion || !descripcion.trim()) {
            return res.status(400).json({ 
                error: 'La descripción es requerida' 
            });
        }
        
        // Actualizar tipo de nodo
        await pool.execute(`
            UPDATE nodo_tipo 
            SET descripcion = ?
            WHERE tipo = ?
        `, [descripcion.trim(), id]);
        
        console.log('✅ Tipo de nodo actualizado:', id);
        res.json({ 
            message: 'Tipo de nodo actualizado correctamente',
            id: parseInt(id),
            descripcion: descripcion.trim()
        });
        
    } catch (error) {
        console.error('💥 Error actualizando tipo de nodo:', error);
        res.status(500).json({ 
            error: 'Error actualizando tipo de nodo',
            details: error.message 
        });
    }
});

// DELETE - Eliminar tipo de nodo (opcional)
app.delete('/api/nodo-tipos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando tipo de nodo ${id}`);
        
        // Verificar que el tipo de nodo existe
        const [tipoExists] = await pool.execute('SELECT tipo, descripcion FROM nodo_tipo WHERE tipo = ?', [id]);
        if (tipoExists.length === 0) {
            return res.status(404).json({ error: 'Tipo de nodo no encontrado' });
        }
        
        // Verificar si hay nodos que usan este tipo
        const [nodosAsociados] = await pool.execute('SELECT COUNT(*) as count FROM nodo WHERE tipo = ?', [id]);
        
        if (nodosAsociados[0].count > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar el tipo de nodo porque hay ${nodosAsociados[0].count} nodo(s) que lo utilizan.`
            });
        }
        
        // Eliminar tipo de nodo
        await pool.execute('DELETE FROM nodo_tipo WHERE tipo = ?', [id]);
        
        console.log('✅ Tipo de nodo eliminado:', id);
        res.json({ 
            message: `Tipo de nodo "${tipoExists[0].descripcion}" eliminado correctamente`,
            id: parseInt(id)
        });
        
    } catch (error) {
        console.error('💥 Error eliminando tipo de nodo:', error);
        
        // Error específico para foreign key constraint
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ 
                error: 'No se puede eliminar el tipo de nodo porque tiene nodos asociados'
            });
        }
        
        res.status(500).json({ 
            error: 'Error eliminando tipo de nodo',
            details: error.message 
        });
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
app.post('/api/mensajes', async (req, res) => {
    try {
        const { nodo_id, topico, payload } = req.body;
        
        console.log('💬 Creando nuevo mensaje:', req.body);
        
        // Validar campos requeridos
        if (!nodo_id || !topico || !payload) {
            return res.status(400).json({ 
                error: 'Nodo ID, tópico y payload son obligatorios' 
            });
        }
        
        // Verificar que el nodo existe
        const [nodoExists] = await pool.execute('SELECT id FROM nodo WHERE id = ?', [nodo_id]);
        if (nodoExists.length === 0) {
            return res.status(400).json({ error: 'El nodo especificado no existe' });
        }
        
        // Insertar nuevo mensaje
        const [result] = await pool.execute(`
            INSERT INTO mensaje (nodo_id, topico, payload) 
            VALUES (?, ?, ?)
        `, [parseInt(nodo_id), topico.trim(), payload.trim()]);
        
        console.log('✅ Mensaje creado exitosamente:', result.insertId);
        
        // Obtener el mensaje creado para devolverlo
        const [newMessage] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.descripcion as nodo_descripcion
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE m.id = ?
        `, [result.insertId]);
        
        const mensaje = {
            id: newMessage[0].id,
            nodo_id: newMessage[0].nodo_id,
            nodo_identificador: newMessage[0].nodo_descripcion,
            topico: newMessage[0].topico,
            payload: newMessage[0].payload,
            fecha: newMessage[0].fecha
        };
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Mensaje creado exitosamente',
            mensaje: mensaje
        });
        
    } catch (error) {
        console.error('💥 Error creando mensaje:', error);
        res.status(500).json({ 
            error: 'Error creando mensaje',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});

// PUT - Actualizar mensaje
app.put('/api/mensajes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nodo_id, topico, payload } = req.body;
        
        console.log(`✏️ Actualizando mensaje ${id}:`, req.body);
        
        // Verificar que el mensaje existe
        const [messageExists] = await pool.execute('SELECT id FROM mensaje WHERE id = ?', [id]);
        if (messageExists.length === 0) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }
        
        // Validar campos requeridos
        if (!nodo_id || !topico || !payload) {
            return res.status(400).json({ 
                error: 'Nodo ID, tópico y payload son obligatorios' 
            });
        }
        
        // Verificar que el nodo existe
        const [nodoExists] = await pool.execute('SELECT id FROM nodo WHERE id = ?', [nodo_id]);
        if (nodoExists.length === 0) {
            return res.status(400).json({ error: 'El nodo especificado no existe' });
        }
        
        // Actualizar mensaje
        await pool.execute(`
            UPDATE mensaje 
            SET nodo_id = ?, topico = ?, payload = ?
            WHERE id = ?
        `, [parseInt(nodo_id), topico.trim(), payload.trim(), id]);
        
        console.log('✅ Mensaje actualizado:', id);
        
        // Obtener el mensaje actualizado para devolverlo
        const [updatedMessage] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.descripcion as nodo_descripcion
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE m.id = ?
        `, [id]);
        
        const mensaje = {
            id: updatedMessage[0].id,
            nodo_id: updatedMessage[0].nodo_id,
            nodo_identificador: updatedMessage[0].nodo_descripcion,
            topico: updatedMessage[0].topico,
            payload: updatedMessage[0].payload,
            fecha: updatedMessage[0].fecha
        };
        
        res.json({ 
            message: 'Mensaje actualizado correctamente',
            mensaje: mensaje
        });
        
    } catch (error) {
        console.error('💥 Error actualizando mensaje:', error);
        res.status(500).json({ 
            error: 'Error actualizando mensaje',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});

// DELETE - Eliminar mensaje
app.delete('/api/mensajes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando mensaje ${id}`);
        
        // Verificar que el mensaje existe
        const [messageExists] = await pool.execute(
            'SELECT id, topico, payload FROM mensaje WHERE id = ?', 
            [id]
        );
        if (messageExists.length === 0) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }
        
        const mensaje = messageExists[0];
        
        // Eliminar mensaje
        await pool.execute('DELETE FROM mensaje WHERE id = ?', [id]);
        
        console.log('✅ Mensaje eliminado:', id);
        res.json({ 
            message: `Mensaje "${mensaje.topico}: ${mensaje.payload}" eliminado correctamente`,
            id: parseInt(id)
        });
        
    } catch (error) {
        console.error('💥 Error eliminando mensaje:', error);
        res.status(500).json({ 
            error: 'Error eliminando mensaje',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    }
});

// GET - Obtener un mensaje específico (opcional, útil para debug)
app.get('/api/mensajes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Obteniendo mensaje ${id}`);
        
        const [rows] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.descripcion as nodo_descripcion
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE m.id = ?
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Mensaje no encontrado' });
        }
        
        const mensaje = {
            id: rows[0].id,
            nodo_id: rows[0].nodo_id,
            nodo_identificador: rows[0].nodo_descripcion,
            topico: rows[0].topico,
            payload: rows[0].payload,
            fecha: rows[0].fecha
        };
        
        console.log('✅ Mensaje obtenido:', mensaje);
        res.json(mensaje);
        
    } catch (error) {
        console.error('💥 Error obteniendo mensaje:', error);
        res.status(500).json({ error: 'Error obteniendo mensaje' });
    }
});

// GET - Obtener mensajes con paginación y filtros (mejorado)
app.get('/api/mensajes', async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            nodo_id, 
            topico, 
            fecha_inicio, 
            fecha_fin 
        } = req.query;
        
        console.log('💬 Obteniendo mensajes con filtros:', req.query);
        
        let whereClause = '1=1';
        let queryParams = [];
        
        // Aplicar filtros
        if (nodo_id) {
            whereClause += ' AND m.nodo_id = ?';
            queryParams.push(parseInt(nodo_id));
        }
        
        if (topico) {
            whereClause += ' AND m.topico LIKE ?';
            queryParams.push(`%${topico}%`);
        }
        
        if (fecha_inicio) {
            whereClause += ' AND m.fecha >= ?';
            queryParams.push(fecha_inicio);
        }
        
        if (fecha_fin) {
            whereClause += ' AND m.fecha <= ?';
            queryParams.push(fecha_fin + ' 23:59:59');
        }
        
        // Calcular offset para paginación
        const offset = (parseInt(page) - 1) * parseInt(limit);
        queryParams.push(parseInt(limit), offset);
        
        const [rows] = await pool.execute(`
            SELECT m.id, m.nodo_id, m.topico, m.payload, m.fecha,
                   n.descripcion as nodo_descripcion
            FROM mensaje m
            LEFT JOIN nodo n ON m.nodo_id = n.id
            WHERE ${whereClause}
            ORDER BY m.fecha DESC
            LIMIT ? OFFSET ?
        `, queryParams);
        
        // Obtener total de registros para paginación
        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total
            FROM mensaje m
            WHERE ${whereClause}
        `, queryParams.slice(0, -2)); // Remover limit y offset del conteo
        
        // Formatear para frontend
        const mensajes = rows.map(mensaje => ({
            id: mensaje.id,
            nodo_id: mensaje.nodo_id,
            nodo_identificador: mensaje.nodo_descripcion,
            topico: mensaje.topico,
            payload: mensaje.payload,
            fecha: mensaje.fecha
        }));
        
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / parseInt(limit));
        
        console.log('✅ Mensajes obtenidos:', mensajes.length);
        res.json({
            data: mensajes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalRecords,
                pages: totalPages
            }
        });
        
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
