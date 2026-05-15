"use strict";

// Keep the public process entrypoint thin. The runtime composition root owns the
// current Node listener wiring while services and route modules own behavior.
require("./mobile-server-runtime");
