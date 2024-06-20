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
        res.status(401).json({ error: 'Token inválido' });
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

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
