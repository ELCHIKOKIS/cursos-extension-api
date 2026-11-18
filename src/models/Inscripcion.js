const mongoose = require('mongoose');

const inscripcionSchema = new mongoose.Schema(
  {
    participante_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Participante',
      required: true
    },
    curso_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Curso',
      required: true
    },
    fecha_inscripcion: {
      type: Date,
      required: true,
      default: Date.now
    },
    estado: {
      type: String,
      required: true,
      enum: ['Confirmada', 'Inscrito', 'Cancelada', 'Pendiente'],
      default: 'Pendiente'
    },
    comprobante: {
      archivo_id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
      },
      nombre_archivo: {
        type: String,
        trim: true
      },
      tipo_contenido: {
        type: String,
        enum: ['application/pdf', 'image/jpeg', 'image/png']
      },
      tamano_bytes: {
        type: Number,
        min: 1
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inscripcion', inscripcionSchema);
