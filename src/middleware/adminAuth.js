const { authenticateToken, requireRoles } = require('./auth');

module.exports = [authenticateToken, requireRoles('admin')];
