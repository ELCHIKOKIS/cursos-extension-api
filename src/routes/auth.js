const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const Participante = require('../models/Participante');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function sameSecret(left, right) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function signSession(subject, role, name) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('La autenticación no está configurada');
  }

  return jwt.sign({ role, name }, secret, {
    subject: String(subject),
    expiresIn: '1h',
    algorithm: 'HS256'
  });
}

function sendSession(res, token, user) {
  res.set('Cache-Control', 'no-store');
  return res.json({
    token,
    token_type: 'Bearer',
    expires_in: 3600,
    user
  });
}

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Ingresa tu correo y contraseña' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword &&
      email === adminEmail.trim().toLowerCase() &&
      sameSecret(password, adminPassword)) {
      const user = { id: email, nombre: 'Administrador', email, role: 'admin' };
      return sendSession(res, signSession(email, 'admin', user.nombre), user);
    }

    const participant = await Participante.findOne({ email }).select('+passwordHash');
    if (
      !participant ||
      participant.estado !== 'Activo' ||
      !participant.passwordHash ||
      !participant.verifyPassword(password)
    ) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    if (!['Docente', 'Estudiante'].includes(participant.tipo_participante)) {
      return res.status(403).json({ error: 'Este tipo de cuenta no puede iniciar sesión' });
    }

    const role = participant.tipo_participante === 'Docente' ? 'docente' : 'estudiante';
    const user = {
      id: String(participant._id),
      nombre: participant.nombre,
      email: participant.email,
      role
    };
    return sendSession(res, signSession(participant._id, role, participant.nombre), user);
  } catch (error) {
    return next(error);
  }
});

router.post('/student/register', async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body;
    if (
      typeof nombre !== 'string' ||
      !nombre.trim() ||
      nombre.trim().length > 100 ||
      typeof email !== 'string' ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: 'Completa tu nombre, un correo válido y una contraseña de 12 a 128 caracteres'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await Participante.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        error: 'Este correo ya está registrado. Inicia sesión o pide a administración que active tu cuenta.'
      });
    }

    const student = new Participante({
      nombre: nombre.trim(),
      email: normalizedEmail,
      tipo_participante: 'Estudiante'
    });
    student.setPassword(password);
    await student.save();

    const user = {
      id: String(student._id),
      nombre: student.nombre,
      email: student.email,
      role: 'estudiante'
    };
    return sendSession(res, signSession(student._id, 'estudiante', student.nombre), user);
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    if (req.auth.role === 'admin') {
      return res.json({
        user: { id: req.auth.subject, nombre: 'Administrador', email: req.auth.subject, role: 'admin' }
      });
    }

    const participant = await Participante.findOne({
      _id: req.auth.subject,
      estado: 'Activo'
    });
    if (!participant) {
      return res.status(401).json({ error: 'La cuenta ya no está activa' });
    }
    if (!['Docente', 'Estudiante'].includes(participant.tipo_participante)) {
      return res.status(401).json({ error: 'El tipo de cuenta no admite esta sesión' });
    }

    const expectedRole = participant.tipo_participante === 'Docente' ? 'docente' : 'estudiante';
    if (expectedRole !== req.auth.role) {
      return res.status(401).json({ error: 'El rol de esta sesión ya no es válido' });
    }

    return res.json({
      user: {
        id: String(participant._id),
        nombre: participant.nombre,
        email: participant.email,
        role: expectedRole
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
