import { createContext } from "react";

/** True inside the signed-in app shell; the public site's <Navigation /> steps aside there. */
export const ShellContext = createContext(false);
