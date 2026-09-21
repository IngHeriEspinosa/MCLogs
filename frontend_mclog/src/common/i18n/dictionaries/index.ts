import type { Locale } from "../config";
import { en } from "./en";
import { es, Dictionary } from "./es";

export type { Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { es, en };
