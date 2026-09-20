import type { Metadata } from "next";
import Link from "next/link";
import { repoFile } from "@/lib/site";

export const metadata: Metadata = {
  title: "Licencia",
  description:
    "MCLog se publica bajo licencia MIT: puedes usarlo, modificarlo y distribuirlo, incluso comercialmente, conservando el aviso de copyright y sin ninguna garantía.",
  alternates: { canonical: "/legal/licencia" },
};

const PERMISSIONS = [
  "Usarlo con fines comerciales",
  "Modificar el código a tu gusto",
  "Distribuirlo, tal cual o modificado",
  "Usarlo de forma privada sin publicar nada",
  "Sublicenciarlo dentro de un producto mayor",
];

const CONDITIONS = [
  "Conservar el aviso de copyright y el texto de la licencia en las copias que distribuyas",
];

const LIMITATIONS = [
  "No se ofrece ninguna garantía: el software se entrega «tal cual»",
  "Los autores no asumen responsabilidad por daños derivados de su uso",
];

function Column({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "warn" | "no" }) {
  const dot = {
    ok: "bg-green-500",
    warn: "bg-amber-500",
    no: "bg-slate-400",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 p-6">
      <h2 className="font-heading text-base font-semibold text-slate-900">{title}</h2>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
            <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${dot}`} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LicenciaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900">
        Licencia MIT
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-600">
        MCLog es software libre bajo licencia MIT, una de las más permisivas que existen. En la
        práctica: haz lo que quieras con él, pero no esperes garantías.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Column title="Puedes" items={PERMISSIONS} tone="ok" />
        <Column title="Debes" items={CONDITIONS} tone="warn" />
        <Column title="No incluye" items={LIMITATIONS} tone="no" />
      </div>

      <div className="prose mt-12">
        <h2 id="que-significa">Qué significa en la práctica</h2>
        <p>
          No hay edición de pago, ni versión «enterprise», ni funciones reservadas. Puedes instalar
          MCLog para tu empresa, ofrecérselo a tus clientes como parte de un servicio, modificarlo
          para que encaje con tu infraestructura o partir de él para construir otra cosa. No tienes
          que pedir permiso, avisar ni publicar tus cambios.
        </p>
        <p>
          La única obligación es la habitual de la MIT: si distribuyes el código —original o
          modificado—, incluye el aviso de copyright y el texto de la licencia.
        </p>
        <p>
          La cláusula de ausencia de garantía es real, no un formalismo. MCLog se entrega «tal
          cual». Si lo pones en producción, la responsabilidad de probarlo, respaldarlo y
          mantenerlo es tuya. La{" "}
          <Link href="/docs/despliegue">guía de despliegue</Link> cubre las copias de seguridad
          automáticas precisamente por esto.
        </p>

        <h2 id="texto-completo">Texto completo</h2>
        <p>
          El texto íntegro de la licencia está en el fichero{" "}
          <a href={repoFile("LICENSE")} target="_blank" rel="noopener noreferrer">
            LICENSE
          </a>{" "}
          del repositorio. La librería npm{" "}
          <a href={repoFile("packages/mclog/LICENSE")} target="_blank" rel="noopener noreferrer">
            se publica bajo la misma licencia
          </a>
          .
        </p>

        <h2 id="contribuir">Contribuir</h2>
        <p>
          Las correcciones y mejoras son bienvenidas por pull request. Al contribuir aceptas que tu
          aportación se publique bajo esta misma licencia, que es el funcionamiento estándar de un
          proyecto MIT.
        </p>
      </div>
    </div>
  );
}
