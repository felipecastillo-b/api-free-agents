import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { error } from 'console';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = 'your_jwt_secret';

// Define an interface for the JWT payload
interface JwtPayloadWithUserId extends JwtPayload {
    userId: string;
}

// Extend the Request interface to include userId
interface AuthenticatedRequest extends Request {
    userId?: string;
}

// Registro de usuario
app.post('/register', async (req: Request, res: Response) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const usuario = await prisma.usuario.create({
            data: {
                username,
                email,
                password: hashedPassword,
            },
        });
        res.status(201).json({ message: 'Usuario registrado exitosamente', usuario });
    } catch (error) {
        res.status(400).json({ error: 'Error al registrar usuario' });
    }
});

// Login de usuario
app.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const usuario = await prisma.usuario.findUnique({
        where: {
            username: username
        }
    });

    if (!usuario) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const isPasswordValid = await bcrypt.compare(password, usuario.password);
    if (!isPasswordValid) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ userId: usuario.id.toString() }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
});

// Middleware para autenticar
const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadWithUserId;
        req.userId = decoded.userId;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Token expirado' });
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Token invalido' });
        }
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Rutas protegidas
app.get('/profile', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
        return res.status(400).json({ error: 'User ID not found' });
    }
    const userId = parseInt(req.userId, 10); // Convierte userId a  un numero
    const usuario = await prisma.usuario.findUnique({ where: { id: userId } });
    res.json(usuario);
});

// Dashboard de usuario
app.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found' });
        }
        const userIdAsNumber = parseInt(userId, 10);
        const usuario = await prisma.usuario.findUnique({ where: { id: userIdAsNumber } });
        res.json(usuario);
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// Endpoint para verificar si el usuario esta registrado como Jugador
app.get('/esJugador', authenticate, async(req: AuthenticatedRequest, res: Response) =>{
    try {
        if(!req.userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const jugador = await prisma.jugador.findUnique({
            where: { usuarioId: parseInt(req.userId, 10) },
        });
        res.json({ esJugador: !!jugador }) // Se devuelve TRUE si existe el jugador, caso contrario FALSE
    } catch (error) {
        console.log('Error al verificar el jugador:', error);
        res.status(500).json({ error: 'Error al verificar jugador' });
    }
});

// Endpoint para registrar un Usuario como Jugador
app.post('/registrarJugador', authenticate, async(req: AuthenticatedRequest, res: Response) => {
    const {
        nombre,
        apellido,
        edad,
        rango,
        rol,
        rolSecundario,
        biografia,
        disponibilidad,
        perfilTracker,
        nacionalidad,
        idioma,
        idiomaSecundario,
        twitter,
        twitch,
        kickStream,
        youtube,
    } = req.body;

    try {
        if (!req.userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        // Verifica si ya existe un Jugador para este Usuario
        const existingJugador = await prisma.jugador.findUnique({
            where: { usuarioId: parseInt(req.userId, 10) },
        });

        if (existingJugador) {
            return res.status(400).json({ error: 'El Usuario ya esta registrado como Jugador' });
        }

        // Registra al Usuario como Jugador
        const jugador = await prisma.jugador.create({
            data: {
                usuarioId: parseInt(req.userId, 10),
                nombre,
                apellido,
                edad,
                rango,
                rol,
                rolSecundario,
                biografia,
                disponibilidad,
                perfilTracker,
                nacionalidad,
                idioma,
                idiomaSecundario,
                twitter,
                twitch,
                kickStream,
                youtube,
            },
        });        
        res.status(201).json({ message: 'Jugador registrado exitosamente:', jugador });

    } catch (error) {
        console.log('Error al registrar jugador:', error);
        res.status(500).json({ error: ' Error al registrar jugador' });
    }
});

// Endpoint para obtener el perfil del jugador
app.get('/perfilJugador', authenticate, async(req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const jugador = await prisma.jugador.findUnique({
            where: { usuarioId: parseInt(req.userId, 10) },
            include: { Usuario: true }, // Para incluir los datos del Usuario
        });

        if (!jugador) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }
        res.json(jugador);

    } catch (error) {
        console.log('Error al obtener el perfil del jugador:', error);
        res.status(500).json({ error: 'Error al obtener el perfil del jugador' });
    }
});

// Endpoint para actualizar datos del pefil del jugador
app.put("/actualizarPerfilJugador", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: "Usuario no autenticado" });
        }
        const userIdAsNumber = parseInt(userId, 10);

        const {
            nombre,
            apellido,
            edad,
            rango,
            rol,
            rolSecundario,
            biografia,
            disponibilidad,
            perfilTracker,
            nacionalidad,
            idioma,
            idiomaSecundario,
            twitter,
            twitch,
            kickStream,
            youtube,
        } = req.body;

        // asegurar que edad es un INT y no un string
        const edadAsNumber = parseInt(edad, 10);

        const existingJugador = await prisma.jugador.findUnique({
            where: { usuarioId: userIdAsNumber },
        });

        if (!existingJugador) {
            return res.status(404).json({ error: "Peril de jugador no encontrado" });
        }

        const updateJugador = await prisma.jugador.update({
            where: { usuarioId: userIdAsNumber },
            data: {
                nombre,
                apellido,
                edad: edadAsNumber,
                rango,
                rol,
                rolSecundario,
                biografia,
                disponibilidad,
                perfilTracker,
                nacionalidad,
                idioma,
                idiomaSecundario,
                twitter,
                twitch,
                kickStream,
                youtube,
                updatedAt: new Date(),
            },
        });

        res.json(updateJugador);
    } catch (error) {
        console.log("Error al actualizar el perfil del jugador", error);
        res.status(500).json({ error: "Error al actualizar el perfil del jugador" });
    }
});

// Endpoint para encontrar jugador
app.get("/jugador/:username", authenticate, async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.status(400).json({ error: "El usuario es requerido" });
        }

        // busca el usuario por username
        const usuario = await prisma.usuario.findUnique({
            where: { username },
            include: {
                Jugador: true, // incluye los datos de la tabla Jugador
            },
        });

        if (!usuario) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        if (!usuario.Jugador) {
            return res.status(200).json({ error: "El perfil del jugador no existe aun", jugador: null });
        }

        // extrae los datos del perfil jugador
        const jugador = usuario.Jugador;

        res.json({
            username: usuario.username,
            nombre: jugador.nombre,
            apellido: jugador.apellido,
            edad: jugador.edad,
            rango: jugador.rango,
            rol: jugador.rol,
            rolSecundario: jugador.rolSecundario,
            biografia: jugador.biografia,
            disponibilidad: jugador.disponibilidad,
            perfilTracker: jugador.perfilTracker,
            nacionalidad: jugador.nacionalidad,
            idioma: jugador.idioma,
            idiomaSecundario: jugador.idiomaSecundario,
            twitter: jugador.twitter,
            twitch: jugador.twitch,
            kickStream: jugador.kickStream,
            youtube: jugador.youtube,
        });
    } catch (error) {
        console.log('Error al buscar el perfil del jugador', error);
        res.status(500).json({ error: 'Error al buscar el perfil del jugador' });
    }
});

// Endpoint para obtener los equipos a los que pertenezco
app.get("/misEquipos", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const usuarioId = parseInt(req.userId as string, 10);

        const jugador = await prisma.jugador.findUnique({
            where: { usuarioId },
            include: {
                JugadoresEquipos: {
                    include: {
                        Equipo: true
                    },
                }
            }
        });

        if (!jugador) {
            return res.status(404).json({ error: "No se encontro el perfil del jugador" });
        }

        // extrae los equipos a los que pertenece el jugador
        const equipos = jugador.JugadoresEquipos.map((je) => ({
            id: je.Equipo.id,
            nombre: je.Equipo.nombre,
            descripcion: je.Equipo.descripcion,
            fundadoEn: je.Equipo.fundadoEn,
            esAdministrador: je.rol === "Administrador" || je.rol === "Manager"
        }));

        res.json(equipos);
    } catch ( error ) {
        console.log('Error al obtener los equipos del usuario', error);
        res.status(500).json({ error: 'Error al obtener los equipos del usuario' });
    }
});

app.post("/crearEquipo", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { nombre, descripcion, fundadoEn } = req.body;
        const usuarioId = parseInt(req.userId as string, 10);

        if (!usuarioId) {
            return res.status(401).json({ error: "Usuario no autenticado" });
        }

        const nuevoEquipo = await prisma.equipo.create({
            data: {
                nombre,
                descripcion,
                fundadoEn: new Date(fundadoEn),
                JugadoresEquipos: {
                    create: {
                        Jugador: {
                            connect: { usuarioId },
                        },
                        fechaUnion: new Date(),
                        rol: 'Administrador',
                    },
                },
            },
        });

        res.status(201).json({ message: "Equipo creado correctamente", equipo: nuevoEquipo });
    } catch (error) {
        console.log('Error al crear el equipo', error);
        res.status(500).json({ error: 'Error al crear el equipo' });
    }
});

// Endpoint para obtener los datos del equipo
app.get("/equipos/:id", async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const equipo = await prisma.equipo.findUnique({
            where: { id: parseInt(id, 10) },
        });

        if (!equipo) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }

        res.status(200).json(equipo);
    } catch (error) {
        console.error("Error al obtener el equipo", error);
        res.status(500).json({ error: "Error al obtener el equipo" });
    }
});

// Endpoint para editar un equipo siendo administrador
app.put("/editarEquipo/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion } = req.body;
        const usuarioId = parseInt(req.userId as string, 10);

        if (!usuarioId) {
            return res.status(401).json({ error: "Usuario no autenticado" });
        }

        // verifica si el usuario es administrador del equipo
        const jugadorEquipo = await prisma.jugadoresEquipos.findFirst({
            where: {
                equipoId: parseInt(id, 10),
                jugadorId: usuarioId,
                rol: {
                    in: ["Administrador", "Manager"]
                }
            },
        });

        if (!jugadorEquipo) {
            return res.status(403).json({ error: "No tienes permiso para editar este equipo" });
        }

        // editar el equipo
        const equipoEditado = await prisma.equipo.update({
            where: { id: parseInt(id, 10) },
            data: { nombre, descripcion },
        });

        res.status(200).json({ message: "Equipo editado correctamente" });
    } catch (error) {
        console.log('Error al editar el equipo', error);
        res.status(500).json({ error: 'Error al editar el equipo' });
    }
});

app.delete("/borrarEquipo/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const usuarioId = parseInt(req.userId as string, 10);

        if (!usuarioId) {
            return res.status(401).json({ error: "Usuario no autenticado" });
        }

        // verifica si el usuario es Administrador del equipo
        const jugadorEquipo = await prisma.jugadoresEquipos.findFirst({
            where: {
                equipoId: parseInt(id, 10),
                jugadorId: usuarioId,
                rol: {
                    in: ["Administrador"]
                }
            },
        });

        if (!jugadorEquipo) {
            return res.status(403).json({ error: "No tienes permiso para borrar el equipo" });
        }

        // Borra todas las relaciones de jugadoresEquipos
        await prisma.jugadoresEquipos.deleteMany({
            where: { equipoId: parseInt(id, 10) },
        })

        // Borra el equipo
        await prisma.equipo.delete({
            where: { id: parseInt(id, 10) },
        });

        res.status(200).json({ message: "Equipo borrado correctamente" });
    } catch (error) {
        console.log('Error al borrar el equipo', error);
        res.status(500).json({ error: 'Error al borrar el equipo' });
    }
});

// Endpoint para obtener los datos del equipo y jugadores
app.get("/verEquipo/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        if (!req.userId) {
            return res.status(401).json({ error: "Usuario no autenticado" });
        }

        const usuarioId = parseInt(req.userId, 10);
        if (isNaN(usuarioId)) {
            return res.status(400).json({ error: "ID de usuario invalido" });
        }

        // Obtener el equipo junto con el rol del usuario en ese equipo
        const equipo = await prisma.equipo.findUnique({
            where: { id: parseInt(id, 10) },
            include: {
                JugadoresEquipos: {
                    include: {
                        Jugador: {
                            include: {
                                Usuario: true
                            }
                        },
                    }
                }
            }
        });

        if (!equipo) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }

        // Determinar el rol del usuario en el equipo
        const miembro = equipo.JugadoresEquipos.find(je => je.Jugador.usuarioId === usuarioId);
        const esAdministrador = miembro ? ["Administrador", "Manager"].includes(miembro.rol ?? "") : false;

        // Formatear la respuesta con los miembros y sus roles
        const equipoConMiembros = {
            ...equipo,
            miembros: equipo.JugadoresEquipos.map(({ Jugador, rol }) => ({
                jugador: {
                    id: Jugador.id,
                    username: Jugador.Usuario.username,
                },
                rol,
            })),
        };

        res.status(200).json({ equipo: equipoConMiembros, esAdministrador });
    } catch (error) {
        console.error("Error al obtener el equipo", error);
        res.status(500).json({ error: "Error al obtener el equipo" });
    }
});

// Endpoint para invitar a un jugador al equipo
app.post('/invitarJugador', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { equipoId: equipoIdString, username, mensaje } = req.body;
        const userId = parseInt(req.userId as string, 10);
        const equipoId = parseInt(equipoIdString, 10);

        if (!username || isNaN(equipoId) || !mensaje) { // Verificar que equipoId sea un número válido
            return res.status(400).json({ error: 'Faltan datos requeridos' });
        }

        // Verifica si el usuario es Administrador o Manager del equipo
        const jugadorEquipo = await prisma.jugadoresEquipos.findFirst({
            where: {
                equipoId,
                jugadorId: userId,
                rol: { in: ['Administrador', 'Manager'] },
            },
        });

        if (!jugadorEquipo) {
            return res.status(403).json({ error: 'No tienes permiso para invitar jugadores a este equipo' });
        }

        // Obtiene el jugador a invitar
        const jugador = await prisma.jugador.findFirst({
            where: { Usuario: { username } },
        });

        if (!jugador) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // Crea la oferta
        const oferta = await prisma.oferta.create({
            data: {
                equipoId,
                jugadorId: jugador.id,
                mensaje,
                estado: 'Pendiente',
            },
        });

        res.status(201).json({ message: 'Invitación enviada correctamente', oferta });
    } catch (error) {
        console.log('Error al invitar al jugador:', error);
        res.status(500).json({ error: 'Error al invitar al jugador' });
    }
});

// Endpoint para obtener las ofertas recibidas por un jugador
app.get('/ofertasRecibidas', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = parseInt(req.userId as string, 10);

        // Obtiene el jugador
        const jugador = await prisma.jugador.findUnique({
            where: { usuarioId: userId },
        });

        if (!jugador) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // Obtiene las ofertas recibidas
        const ofertas = await prisma.oferta.findMany({
            where: { jugadorId: jugador.id },
            include: { Equipo: true },
        });

        res.status(200).json(ofertas);
    } catch (error) {
        console.log('Error al obtener las ofertas recibidas:', error);
        res.status(500).json({ error: 'Error al obtener las ofertas recibidas' });
    }
});

// Endpoint para aceptar o rechazar una oferta
app.put('/respuestaOferta/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { estado } = req.body; // 'Aceptada' o 'Rechazada'
        const userId = parseInt(req.userId as string, 10);

        if (!['Aceptada', 'Rechazada'].includes(estado)) {
            return res.status(400).json({ error: 'Estado de oferta inválido' });
        }

        // Obtiene el jugador
        const jugador = await prisma.jugador.findUnique({
            where: { usuarioId: userId },
        });

        if (!jugador) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // Encuentra la oferta
        const oferta = await prisma.oferta.findUnique({
            where: { id: parseInt(id, 10) },
            include: { Equipo: true }, // Incluye informacion del equipo
        });

        if (!oferta || oferta.jugadorId !== jugador.id) {
            return res.status(404).json({ error: 'Oferta no encontrada o no pertenece al jugador' });
        }

        // Actualiza el estado de la oferta
        const ofertaActualizada = await prisma.oferta.update({
            where: { id: oferta.id },
            data: { estado },
        });

        // Si la oferta fue aceptada, se debe insertar el jugador en el equipo
        if (estado === 'Aceptada') {
            await prisma.jugadoresEquipos.create({
                data: {
                    jugadorId: jugador.id,
                    equipoId: oferta.equipoId,
                    rol: 'Jugador', // Asigna un rol predeterminado 'Jugador'
                    fechaUnion: new Date(),
                },
            });
        }

        res.status(200).json({ message: 'Oferta actualizada correctamente', oferta: ofertaActualizada });
    } catch (error) {
        console.log('Error al actualizar la oferta:', error);
        res.status(500).json({ error: 'Error al actualizar la oferta' });
    }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
