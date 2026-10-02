import { resetCooldowns } from "@/lib/chains/http";

// The 429 back-off is module-level state; never let it leak between tests.
beforeEach(() => resetCooldowns());
