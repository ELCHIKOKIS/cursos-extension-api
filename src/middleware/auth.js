const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    return res.status(503).json({ error: 'La autenticación no está configurada' });
  }

  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Inicia sesión para continuar' });
  }

  try {
    const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    if (
      typeof payload.sub !== 'string' ||
      !['admin', 'docente', 'estudiante'].includes(payload.role)
    ) {
      return res.status(401).json({ error: 'La sesión no es válida' });
    }

    req.auth = { subject: payload.sub, role: payload.role };
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'La sesión expiró o no es válida' });
    }
    return next(error);
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Inicia sesión para continuar' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción' });
    }
    return next();
  };
}

module.exports = { authenticateToken, requireRoles };
