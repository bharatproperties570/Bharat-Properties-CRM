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
import { authenticate } from "../src/middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

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
