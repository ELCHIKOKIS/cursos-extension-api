const express = require('express');
const Participante = require('../models/Participante');
const Curso = require('../models/Curso');
const Inscripcion = require('../models/Inscripcion');
const requireAdmin = require('../middleware/adminAuth');
const { authenticateToken, requireRoles } = require('../middleware/auth');

const router = express.Router();
const requireStaff = [authenticateToken, requireRoles('admin', 'docente')];

router.get('/', requireStaff, async (req, res, next) => {
  try {
    const filter = {};
    if (typeof req.query.tipo_participante === 'string') {
      filter.tipo_participante = req.query.tipo_participante;
    }
    if (typeof req.query.email === 'string') {
      filter.email = req.query.email.trim().toLowerCase();
    }
    if (req.auth.role === 'docente') {
      const courseIds = await Curso.distinct('_id', { docente_id: req.auth.subject });
      const enrolledIds = await Inscripcion.distinct('participante_id', {
        curso_id: { $in: courseIds },
        estado: { $in: ['Inscrito', 'Confirmada'] }
      });
      filter._id = { $in: enrolledIds };
    }
    return res.json(await Participante.find(filter).sort({ nombre: 1 }));
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', ...requireStaff, async (req, res, next) => {
  try {
    const participante = await Participante.findById(req.params.id);
    if (!participante) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }
    if (req.auth.role === 'docente' && participante.tipo_participante === 'Docente') {
      return res.status(403).json({ error: 'Los docentes solo pueden consultar participantes' });
    }
    if (req.auth.role === 'docente') {
      const courseIds = await Curso.distinct('_id', { docente_id: req.auth.subject });
      const enrollment = await Inscripcion.exists({
        participante_id: participante._id,
        curso_id: { $in: courseIds },
        estado: { $in: ['Inscrito', 'Confirmada'] }
      });
      if (!enrollment) {
        return res.status(403).json({ error: 'Solo puedes consultar estudiantes inscritos en tus cursos' });
      }
    }
    return res.json(participante);
  } catch (error) {
    return next(error);
  }
});

router.post('/', ...requireStaff, async (req, res, next) => {
  try {
    const { nombre, email, tipo_participante: tipo, password } = req.body;
    if (!['Estudiante', 'Docente', 'Externo'].includes(tipo)) {
      return res.status(400).json({ error: 'El tipo de participante no es válido' });
    }
    if (tipo === 'Docente' && req.auth.role !== 'admin') {
      return res.status(403).json({ error: 'Solo administración puede registrar docentes' });
    }
    if (tipo !== 'Externo' && (typeof password !== 'string' || password.length < 12 || password.length > 128)) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 12 y 128 caracteres' });
    }
    if (
      typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 100 ||
      typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({ error: 'Ingresa un nombre y un correo electrónico válido' });
    }

    const participante = new Participante({
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      tipo_participante: tipo
    });
    if (tipo !== 'Externo') {
      participante.setPassword(password);
    }
    await participante.save();
    return res.status(201).json(participante);
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', ...requireStaff, async (req, res, next) => {
  try {
    const allowedFields = ['nombre', 'email', 'estado'];
    const keys = Object.keys(req.body);
    if (!keys.length || keys.some((key) => !allowedFields.includes(key))) {
      return res.status(400).json({ error: 'Solo puedes modificar nombre, correo y estado del participante' });
    }
    if (req.auth.role === 'docente' && (keys.includes('estado') || keys.includes('email'))) {
      return res.status(403).json({ error: 'Los docentes solo pueden actualizar el nombre de sus estudiantes' });
    }

    const participante = await Participante.findById(req.params.id);
    if (!participante) {
      return res.status(404).json({ error: 'Participante no encontrado' });
    }
    if (req.auth.role === 'docente' && participante.tipo_participante === 'Docente') {
      return res.status(403).json({ error: 'Los docentes no pueden modificar cuentas docentes' });
    }
    if (req.auth.role === 'docente') {
      const courseIds = await Curso.distinct('_id', { docente_id: req.auth.subject });
      const enrollment = await Inscripcion.exists({
        participante_id: participante._id,
        curso_id: { $in: courseIds },
        estado: { $in: ['Inscrito', 'Confirmada'] }
      });
      if (!enrollment) {
        return res.status(403).json({ error: 'Solo puedes modificar estudiantes inscritos en tus cursos' });
      }
    }

    for (const key of keys) {
      if (key === 'nombre') participante.nombre = req.body.nombre;
      if (key === 'email') participante.email = req.body.email;
      if (key === 'estado') participante.estado = req.body.estado;
    }
    await participante.save();
    return res.json(participante);
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/password', requireAdmin, async (req, res, next) => {
  try {
    if (
      typeof req.body.password !== 'string' ||
      req.body.password.length < 12 ||
      req.body.password.length > 128
    ) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 12 y 128 caracteres' });
    }
    const participante = await Participante.findById(req.params.id).select('+passwordHash');
    if (!participante || !['Estudiante', 'Docente'].includes(participante.tipo_participante)) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    participante.setPassword(req.body.password);
    await participante.save();
    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
