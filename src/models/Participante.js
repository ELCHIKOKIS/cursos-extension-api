const mongoose = require('mongoose');
const crypto = require('node:crypto');

const participanteSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'El correo electrónico no es válido']
    },
    tipo_participante: {
      type: String,
      required: true,
      enum: ['Estudiante', 'Docente', 'Administrativo', 'Externo']
    },
    estado: {
      type: String,
      required: true,
      enum: ['Activo', 'Inactivo'],
      default: 'Activo'
    },
    passwordHash: {
      type: String,
      select: false
    }
  },
  { timestamps: true }
);

participanteSchema.methods.setPassword = function setPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  this.passwordHash = `${salt}:${hash}`;
};

participanteSchema.methods.verifyPassword = function verifyPassword(password) {
  if (!this.passwordHash) return false;
  const [salt, storedHash] = this.passwordHash.split(':');
  if (!salt || !storedHash) return false;
  const computedHash = crypto.scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(storedHash, 'hex');
  return expectedHash.length === computedHash.length &&
    crypto.timingSafeEqual(computedHash, expectedHash);
};

module.exports = mongoose.model('Participante', participanteSchema);
