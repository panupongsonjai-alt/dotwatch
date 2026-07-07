import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authUser } from "../middlewares/authUser.js";
import { loadUser } from "../middlewares/loadUser.js";

import {
  getGeneratorConfig,
  saveGeneratorConfig,
} from "../controllers/demoGenerator.controller.js";

export const demoGeneratorRouter = Router();

demoGeneratorRouter.use(authUser);
demoGeneratorRouter.use(loadUser);

demoGeneratorRouter.get("/", asyncHandler(getGeneratorConfig));

demoGeneratorRouter.post("/", asyncHandler(saveGeneratorConfig));
