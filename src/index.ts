import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';

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

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
