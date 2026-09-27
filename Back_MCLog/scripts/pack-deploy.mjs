// Empaqueta la API en deploy.tar para desplegarla en CapRover sin commitear
// (`caprover deploy -t ./deploy.tar`). Uso: `npm run pack:deploy`.
//
// La lista de ficheros no se escribe a mano: sale de las instrucciones COPY del
// Dockerfile, asi que un COPY nuevo no puede quedarse fuera del paquete. Antes
// de empaquetar sincroniza el skill de IA y comprueba que el codigo compila; al
// terminar lee el .tar y verifica que contiene todo lo que el Dockerfile copia.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "deploy.tar";
/** Ficheros que CapRover necesita aunque el Dockerfile no los copie. */
const ALWAYS = ["captain-definition", "Dockerfile", ".dockerignore"];

const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

/** Ejecuta un comando en el directorio del backend y aborta si falla. */
const run = (label, command) => {
  console.log(`→ ${label}`);
  // shell: los binarios de npm son .cmd en Windows y Node ya no los lanza sin shell.
  const result = spawnSync(command, { cwd: backendDir, stdio: "inherit", shell: true });
  if (result.status !== 0) fail(`${label}: fallo (codigo ${result.status ?? "desconocido"})`);
};

/** Origenes de los COPY del Dockerfile que salen del contexto (no de otra etapa). */
const dockerfileSources = () => {
  const lines = readFileSync(resolve(backendDir, "Dockerfile"), "utf8").split(/\r?\n/);
  return lines
    .map((line) => line.trim())
    .filter((line) => /^COPY\s/i.test(line) && !/--from=/i.test(line))
    .flatMap((line) => {
      const args = line.split(/\s+/).slice(1).filter((arg) => !arg.startsWith("--"));
      return args.slice(0, -1).map((source) => source.replace(/^\.\//, "").replace(/\/$/, ""));
    });
};

/** Resuelve un origen (admite `*` en el nombre, como `package*.json`) a entradas reales. */
const expand = (source) => {
  if (!source.includes("*")) return [source];
  const dir = dirname(source) === "." ? "" : dirname(source);
  const pattern = new RegExp(`^${source.split("/").pop().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return readdirSync(resolve(backendDir, dir || "."))
    .filter((name) => pattern.test(name))
    .map((name) => (dir ? `${dir}/${name}` : name));
};

run("Sincronizando el skill de IA (docs/skills/mclog → skill/)", "node scripts/sync-skill.mjs");
run("Comprobando tipos", "npx tsc --noEmit -p .");

const sources = [...new Set([...ALWAYS, ...dockerfileSources()])];
const missing = sources.filter((source) => {
  const found = expand(source);
  return found.length === 0 || found.some((entry) => !existsSync(resolve(backendDir, entry)));
});
if (missing.length > 0) fail(`El Dockerfile copia rutas que no existen en disco: ${missing.join(", ")}`);
const entries = [...new Set(sources.flatMap(expand))];

rmSync(resolve(backendDir, OUTPUT), { force: true });
console.log(`→ Empaquetando ${entries.join(", ")}`);
const pack = spawnSync("tar", ["-cf", OUTPUT, ...entries], { cwd: backendDir, stdio: "inherit" });
if (pack.status !== 0) fail("tar no pudo crear el paquete");

// Verificacion: el .tar debe contener cada origen del Dockerfile.
const listing = spawnSync("tar", ["-tf", OUTPUT], { cwd: backendDir, encoding: "utf8" });
if (listing.status !== 0) fail("tar no pudo leer el paquete recien creado");
const packed = listing.stdout.split(/\r?\n/).map((line) => line.replace(/^\.\//, "")).filter(Boolean);
const absent = entries.filter((entry) => !packed.some((path) => path === entry || path.startsWith(`${entry}/`)));
if (absent.length > 0) fail(`El paquete no contiene: ${absent.join(", ")}`);

const sizeKb = Math.round(statSync(resolve(backendDir, OUTPUT)).size / 1024);
console.log(`\n✔ ${OUTPUT} listo (${sizeKb} KB, ${packed.length} entradas). Contiene todo lo que copia el Dockerfile.`);
console.log("  Despliega con: caprover deploy -t ./deploy.tar");
