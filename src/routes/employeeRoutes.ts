import { Hono } from 'hono';
import * as employeeController from '../controllers/employeeController';
import { authMiddleware } from '../middleware/authMiddleware';

const employeeRouter = new Hono();

employeeRouter.use('*', authMiddleware);

employeeRouter.get('/', employeeController.getEmployees);
employeeRouter.post('/', employeeController.addEmployee);
employeeRouter.delete('/:id', employeeController.removeEmployee);

export default employeeRouter; 