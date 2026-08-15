import type { Gender } from "@prisma/client";

// Squad (GIRLS/BOYS) tracks a real high school track/XC team structure --
// two gender-based training groups -- so FEMALE/MALE map onto it
// directly. NONBINARY and PREFER_NOT_TO_SAY have no such squad to map
// to -- deliberately partial, not a total mapping. Callers decide what
// "unmapped" means for them: routes/me.ts's PATCH /gender leaves an
// athlete's existing squad untouched rather than guessing at one, while
// routes/schools.ts's join-request approval (which has no existing squad
// to fall back to) picks its own explicit default -- see that call site.
export const GENDER_TO_SQUAD: Partial<Record<Gender, "GIRLS" | "BOYS">> = {
  FEMALE: "GIRLS",
  MALE: "BOYS",
};
