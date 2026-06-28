import { Router } from "express";
import { triggerWordFetch, getWordCount } from "../controllers/words.controller.js";
import { catchAsync } from "../utils/catchAsync.js";

const router = Router();

router.get("/count", catchAsync(getWordCount));
router.post("/fetch", catchAsync(triggerWordFetch));

export default router;
