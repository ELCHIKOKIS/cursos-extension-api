const express = require('express');
const multer = require('multer');
const Inscripcion = require('../models/Inscripcion');
const Participante = require('../models/Participante');
const Curso = require('../models/Curso');
const requireAdmin = require('../middleware/adminAuth');
const { authenticateToken, requireRoles } = require('../middleware/auth');
const {
  buscarComprobante,
  descargarComprobante,
  eliminarComprobante,
  guardarComprobante,
  nombreSeguro
} = require('../services/comprobantes');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 }
});

function comprobanteValido(file) {
  if (!file) {
    return false;
  }

  if (file.mimetype === 'application/pdf') {
    return file.buffer.subarray(0, 5).toString() === '%PDF-';
  }
  if (file.mimetype === 'image/jpeg') {
    return file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  }
  if (file.mimetype === 'image/png') {
    return file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return false;
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    let filter = {};
    if (req.auth.role === 'estudiante') {
      filter = { participante_id: req.auth.subject };
    } else if (req.auth.role === 'docente') {
      const courseIds = await Curso.distinct('_id', { docente_id: req.auth.subject });
      filter = { curso_id: { $in: courseIds } };
    }
    let query = Inscripcion.find(filter)
      .populate('participante_id')
      .populate('curso_id')
      .sort({ fecha_inscripcion: -1 });
    if (req.auth.role !== 'admin') {
      query = query.select('-comprobante');
    }
    const inscripciones = await query;
    return res.json(inscripciones);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    let query = Inscripcion.findById(req.params.id)
      .populate('participante_id')
      .populate('curso_id');
    if (req.auth.role !== 'admin') {
      query = query.select('-comprobante');
    }
    const inscripcion = await query;
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    if (
      req.auth.role === 'estudiante' &&
      String(inscripcion.participante_id?._id || '') !== req.auth.subject
    ) {
      return res.status(403).json({ error: 'Solo puedes consultar tus propias inscripciones' });
    }
    if (req.auth.role === 'docente') {
      const courseId = inscripcion.curso_id?._id;
      const ownCourse = courseId && await Curso.exists({
        _id: courseId,
        docente_id: req.auth.subject
      });
      if (!ownCourse) {
        return res.status(403).json({ error: 'Solo puedes consultar inscripciones de tus cursos' });
      }
    }
    return res.json(inscripcion);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/comprobante', requireAdmin, async (req, res, next) => {
  try {
    const inscripcion = await Inscripcion.findById(req.params.id);
    if (!inscripcion || !inscripcion.comprobante?.archivo_id) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    const [archivo] = await buscarComprobante(inscripcion.comprobante.archivo_id);
    if (!archivo) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    res.set('Content-Type', archivo.contentType);
    res.set('Content-Disposition', `attachment; filename="${nombreSeguro(archivo.filename)}"`);
    const descarga = descargarComprobante(archivo._id);
    descarga.on('error', next);
    return descarga.pipe(res);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  authenticateToken,
  requireRoles('estudiante'),
  upload.single('comprobante'),
  async (req, res, next) => {
  let comprobante;
  try {
    if (!comprobanteValido(req.file)) {
      return res.status(400).json({
        error: 'Debe adjuntar un comprobante PDF, JPG o PNG válido (máximo 5 MB)'
      });
    }

    const { curso_id: cursoId } = req.body;
    const [participante, curso] = await Promise.all([
      Participante.findOne({
        _id: req.auth.subject,
        tipo_participante: 'Estudiante',
        estado: 'Activo'
      }),
      Curso.findById(cursoId)
    ]);
    if (!participante) {
      return res.status(401).json({ error: 'La cuenta de estudiante ya no está activa' });
    }
    if (!curso) {
      return res.status(400).json({ error: 'curso_id no corresponde a un curso existente' });
    }
    if (curso.estado !== 'Activo') {
      return res.status(400).json({ error: 'No se puede solicitar inscripción a un curso inactivo' });
    }

    const existente = await Inscripcion.findOne({
      participante_id: participante._id,
      curso_id: curso._id,
      estado: { $ne: 'Cancelada' }
    });
    if (existente) {
      return res.status(409).json({ error: 'El estudiante ya tiene una inscripción para este curso' });
    }

    comprobante = await guardarComprobante(req.file);
    const inscripcion = await Inscripcion.create({
      participante_id: participante._id,
      curso_id: curso._id,
      estado: 'Pendiente',
      comprobante
    });
    return res.status(201).json(inscripcion);
  } catch (error) {
    if (comprobante) {
      try {
        await eliminarComprobante(comprobante.archivo_id);
      } catch (cleanupError) {
        return next(new AggregateError([error, cleanupError], 'No se pudo completar o limpiar la carga del comprobante'));
      }
    }
    return next(error);
  }
  }
);

router.patch('/:id/cancelar', authenticateToken, requireRoles('estudiante'), async (req, res, next) => {
  try {
    const cancelada = await Inscripcion.findOneAndUpdate(
      {
        _id: req.params.id,
        participante_id: req.auth.subject,
        estado: { $in: ['Pendiente', 'Inscrito', 'Confirmada'] }
      },
      { $set: { estado: 'Cancelada' } },
      { new: true, runValidators: true }
    ).select('-comprobante');

    if (cancelada) {
      return res.json(cancelada);
    }

    const inscripcion = await Inscripcion.findOne({
      _id: req.params.id,
      participante_id: req.auth.subject
    }).select('_id estado');
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    return res.status(409).json({ error: 'Esta inscripción ya fue cancelada o procesada' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/aprobar', requireAdmin, async (req, res, next) => {
  try {
    const inscripcion = await Inscripcion.findById(req.params.id);
    if (!inscripcion) {
      return res.status(404).json({ error: 'Inscripción no encontrada' });
    }
    if (inscripcion.estado !== 'Pendiente' || !inscripcion.comprobante?.archivo_id) {
      return res.status(409).json({ error: 'Solo se pueden aprobar inscripciones pendientes con comprobante' });
    }

    const aprobada = await Inscripcion.findOneAndUpdate(
      { _id: inscripcion._id, estado: 'Pendiente' },
      { $set: { estado: 'Inscrito' } },
      { new: true, runValidators: true }
    );
    if (!aprobada) {
      return res.status(409).json({ error: 'La inscripción ya fue procesada' });
    }
    return res.json(aprobada);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
