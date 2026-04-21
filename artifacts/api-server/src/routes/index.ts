import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exploreRouter from "./explore";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(exploreRouter);

export default router;
