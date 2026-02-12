import express from 'express';
import {
    getRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole,
    getRoleTemplates,
    cloneRole,
    getRoleUsers
} from '../controllers/role.controller.js';

const router = express.Router();

// List and create roles
router.get('/', getRoles);
router.post('/', createRole);

// Role templates
router.get('/templates', getRoleTemplates);

// Clone role
router.post('/clone', cloneRole);

// Single role operations
router.route('/:id')
    .get(getRoleById)
    .put(updateRole)
    .delete(deleteRole);

// Role users
router.get('/:id/users', getRoleUsers);

export default router;
