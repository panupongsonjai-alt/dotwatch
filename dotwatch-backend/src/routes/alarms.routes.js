import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authUser } from "../middlewares/authUser.js";
import { loadUser } from "../middlewares/loadUser.js";

import {
  acknowledgeAlarm,
  listAlarms,
} from "../controllers/alarms.controller.js";

export const alarmsRouter = Router();

alarmsRouter.use(authUser);
alarmsRouter.use(loadUser);

alarmsRouter.get("/", asyncHandler(listAlarms));
alarmsRouter.post("/:id/acknowledge", asyncHandler(acknowledgeAlarm));
