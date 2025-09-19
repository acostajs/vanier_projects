import { Router } from 'express';
import mainRouter from './main.routes';  
import adminRouter from './admin.routes';

const router = Router();

router.use('/', mainRouter); 
router.use('/admin', adminRouter);

export default router;