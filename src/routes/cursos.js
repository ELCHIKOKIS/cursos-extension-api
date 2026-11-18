const express = require('express');
const Curso = require('../models/Curso');
const Inscripcion = require('../models/Inscripcion');
const Asignacion = require('../models/Asignacion');
const Participante = require('../models/Participante');
const Salon = require('../models/Salon');
const requireAdmin = require('../middleware/adminAuth');
const { authenticateToken, requireRoles } = require('../middleware/auth');

const router = express.Router();
const requireStaff = [authenticateToken, requireRoles('admin', 'docente')];

router.get('/:id/inscripciones-pendientes', requireAdmin, async (req, res, next) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const inscripciones = await Inscripcion.find({
      curso_id: curso._id,
      estado: 'Pendiente'
    })
      .populate('participante_id')
      .sort({ fecha_inscripcion: 1 });
    return res.json(inscripciones);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/estudiantes', ...requireStaff, async (req, res, next) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    if (req.auth.role === 'docente' && String(curso.docente_id) !== req.auth.subject) {
      return res.status(403).json({ error: 'Solo puedes gestionar participantes de tus cursos' });
    }

    const inscripciones = await Inscripcion.find({ curso_id: curso._id })
      .select('-comprobante')
      .populate('participante_id', 'nombre email estado')
      .sort({ fecha_inscripcion: -1 });
    return res.json(inscripciones);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/inscritos', async (req, res, next) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const inscritosConfirmados = await Inscripcion.countDocuments({
      curso_id: curso._id,
      estado: { $in: ['Confirmada', 'Inscrito'] }
    });

    return res.json({
      curso: curso.nombre,
      inscritos_confirmados: inscritosConfirmados
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/salones-disponibles', async (req, res, next) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }

    const inscritosConfirmados = await Inscripcion.countDocuments({
      curso_id: curso._id,
      estado: { $in: ['Confirmada', 'Inscrito'] }
    });
    const salones = await Salon.find({
      disponible: true,
      capacidad: { $gte: inscritosConfirmados }
    }).sort({ capacidad: 1 });

    return res.json(salones);
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    return res.json(await Curso.find().sort({ nombre: 1 }));
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const curso = await Curso.findById(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    return res.json(curso);
  } catch (error) {
    return next(error);
  }
});

router.post('/', ...requireStaff, async (req, res, next) => {
  try {
    const datosCurso = { ...req.body };
    if (req.auth.role === 'docente') {
      const docente = await Participante.findById(req.auth.subject);
      if (!docente || docente.tipo_participante !== 'Docente' || docente.estado !== 'Activo') {
        return res.status(401).json({ error: 'La cuenta docente ya no está activa' });
      }
      datosCurso.docente_id = docente._id;
      datosCurso.responsable = docente.nombre;
    } else if (datosCurso.docente_id) {
      const docente = await Participante.findOne({
        _id: datosCurso.docente_id,
        tipo_participante: 'Docente',
        estado: 'Activo'
      });
      if (!docente) {
        return res.status(400).json({ error: 'docente_id no corresponde a un docente activo existente' });
      }
      datosCurso.responsable = datosCurso.responsable || docente.nombre;
    }

    const curso = await Curso.create(datosCurso);
    return res.status(201).json(curso);
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', ...requireStaff, async (req, res, next) => {
  try {
    const cursoActual = await Curso.findById(req.params.id);
    if (!cursoActual) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    const datosCurso = { ...req.body };
    if (req.auth.role === 'docente') {
      if (String(cursoActual.docente_id) !== req.auth.subject) {
        return res.status(403).json({ error: 'Solo puedes modificar tus propios cursos' });
      }
      if (Object.hasOwn(datosCurso, 'docente_id')) {
        return res.status(403).json({ error: 'Solo administración puede cambiar el docente asignado' });
      }
      delete datosCurso.responsable;
    }
    if (Object.hasOwn(datosCurso, 'docente_id') && datosCurso.docente_id !== null) {
      const docente = await Participante.findOne({
        _id: datosCurso.docente_id,
        tipo_participante: 'Docente',
        estado: 'Activo'
      });
      if (!docente) {
        return res.status(400).json({ error: 'docente_id no corresponde a un docente activo existente' });
      }
      datosCurso.responsable = datosCurso.responsable || docente.nombre;
    }

    const curso = await Curso.findByIdAndUpdate(req.params.id, datosCurso, {
      new: true,
      runValidators: true
    });
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    return res.json(curso);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', ...requireStaff, async (req, res, next) => {
  try {
    const cursoActual = await Curso.findById(req.params.id);
    if (!cursoActual) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    if (req.auth.role === 'docente' && String(cursoActual.docente_id) !== req.auth.subject) {
      return res.status(403).json({ error: 'Solo puedes eliminar tus propios cursos' });
    }
    const [inscripciones, asignaciones] = await Promise.all([
      Inscripcion.countDocuments({ curso_id: req.params.id }),
      Asignacion.countDocuments({ curso_id: req.params.id })
    ]);
    if (inscripciones > 0 || asignaciones > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar un curso con inscripciones o asignaciones relacionadas'
      });
    }

    const curso = await Curso.findByIdAndDelete(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: 'Curso no encontrado' });
    }
    return res.json({ message: 'Curso eliminado correctamente', curso });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
