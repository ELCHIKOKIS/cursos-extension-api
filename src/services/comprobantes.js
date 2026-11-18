const path = require('node:path');
const mongoose = require('mongoose');

const BUCKET_NAME = 'comprobantes_pago';

function getBucket() {
  if (!mongoose.connection.db) {
    throw new Error('MongoDB debe estar conectado para almacenar comprobantes');
  }

  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

function nombreSeguro(nombre) {
  const nombreBase = path.basename(nombre.replace(/\\/g, '/'));
  return nombreBase.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'comprobante';
}

function guardarComprobante(file) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    const upload = bucket.openUploadStream(nombreSeguro(file.originalname), {
      contentType: file.mimetype
    });

    upload.once('error', reject);
    upload.once('finish', () => resolve({
      archivo_id: upload.id,
      nombre_archivo: nombreSeguro(file.originalname),
      tipo_contenido: file.mimetype,
      tamano_bytes: file.size
    }));
    upload.end(file.buffer);
  });
}

function eliminarComprobante(fileId) {
  return getBucket().delete(fileId);
}

function buscarComprobante(fileId) {
  return getBucket().find({ _id: fileId }).toArray();
}

function descargarComprobante(fileId) {
  return getBucket().openDownloadStream(fileId);
}

module.exports = {
  buscarComprobante,
  descargarComprobante,
  eliminarComprobante,
  guardarComprobante,
  nombreSeguro
};
