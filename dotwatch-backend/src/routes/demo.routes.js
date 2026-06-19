import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authUser } from "../middlewares/authUser.js";
import { loadUser } from "../middlewares/loadUser.js";
import {
  createDemoTemplate,
  listDemoTemplates,
  deleteDemoData,
  getDemoStatistics,
  generateDemoAlarmNow,
  generateDemoOfflineNow,
  generateDemoHistoryNow,
} from "../controllers/demo.controller.js";

export const demoRouter = Router();

demoRouter.use(authUser);
demoRouter.use(loadUser);

demoRouter.get("/templates", asyncHandler(listDemoTemplates));
demoRouter.get("/statistics", asyncHandler(getDemoStatistics));
demoRouter.post("/templates/:templateKey", asyncHandler(createDemoTemplate));
demoRouter.delete("/data", asyncHandler(deleteDemoData));
demoRouter.post("/alarms", asyncHandler(generateDemoAlarmNow));
demoRouter.post("/offline", asyncHandler(generateDemoOfflineNow));
demoRouter.post("/history", asyncHandler(generateDemoHistoryNow));
demoRouter.post("/actions/alarm-now", asyncHandler(generateDemoAlarmNow));
demoRouter.post("/actions/offline-now", asyncHandler(generateDemoOfflineNow));
demoRouter.post("/actions/history-now", asyncHandler(generateDemoHistoryNow));
