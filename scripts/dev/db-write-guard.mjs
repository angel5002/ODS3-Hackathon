// The database is shared with the deployed demo. Every script or test that writes to it or resets it
// calls requireDbWrite() first and refuses to run unless ALLOW_DB_WRITE=1 is set explicitly.
export function requireDbWrite(name) {
  if (process.env.ALLOW_DB_WRITE !== "1") {
    console.error(
      `${name}: este script escribe en la base compartida con la demo desplegada (o la reinicia). ` +
        "No se ejecuta sin ALLOW_DB_WRITE=1.",
    );
    process.exit(3);
  }
}
