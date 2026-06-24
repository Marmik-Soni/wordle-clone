import { Router } from "express";
import { triggerWordFetch, getWordCount } from "../controllers/words.controller.js";

const router = Router();

router.get("/count", getWordCount);
router.post("/fetch", triggerWordFetch);

export default router;
