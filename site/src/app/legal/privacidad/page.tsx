import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_REPO, repoFile } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Qué datos recoge este sitio web y qué hace MCLog con tus logs: se instala en tu servidor, no envía telemetría y no existe ningún servicio central al que reporte.",
  alternates: { canonical: "/legal/privacidad" },
};

export default function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-heading text-4xl font-extrabold tracking-tight text-slate-900">
        Privacidad
      </h1>
      <p className="mt-3 text-sm text-slate-500">Última actualización: 20 de septiembre de 2026</p>

      <div className="prose mt-10">
        <p>
          Hay que separar dos cosas que suelen confundirse: <strong>este sitio web</strong>, que
          publica la documentación del proyecto, y <strong>el software MCLog</strong>, que tú
          instalas en tu propia infraestructura.
        </p>

        <h2 id="el-software">El software MCLog</h2>
        <p>
          MCLog es un programa que descargas y ejecutas en tus servidores.{" "}
          <strong>No es un servicio alojado.</strong> En la práctica:
        </p>
        <ul>
          <li>
            Los logs que envían tus aplicaciones se guardan en <strong>tu</strong> base de datos
            PostgreSQL, en <strong>tu</strong> servidor.
          </li>
          <li>
            La instancia <strong>no envía telemetría</strong>, estadísticas de uso ni ningún tipo de
            informe a los autores del proyecto ni a terceros. No existe un servidor central al que
            pudiera reportar.
          </li>
          <li>
            No hay que registrarse ni obtener una licencia: no se recoge tu correo, tu nombre ni
            datos de tu organización.
          </li>
          <li>
            La retención la decides tú. MCLog borra automáticamente los logs más antiguos que la
            retención que configures (entre 3 meses y 5 años), y permite purgas puntuales por fecha y aplicación.
          </li>
        </ul>
        <p>
          Puedes comprobarlo: el código es público y está bajo licencia MIT. Las únicas conexiones
          salientes que hace una instancia son las que tú configuras —los envíos de{" "}
          <Link href="/docs/funcionalidades">alertas</Link> a tu webhook, tu servidor de correo o tu
          bot de Telegram—.
        </p>

        <h2 id="tu-responsabilidad">Si instalas MCLog, el responsable eres tú</h2>
        <p>
          Esto es importante y conviene decirlo claro: en cuanto MCLog corre en tu servidor,{" "}
          <strong>tú eres el responsable del tratamiento</strong> de todo lo que se guarde en él.
          Los autores del proyecto no tienen acceso a tus datos ni intervienen de ninguna forma.
        </p>
        <p>
          Los logs de aplicación acaban conteniendo datos personales con más frecuencia de la que
          parece: identificadores de usuario, correos, direcciones IP, contenidos de peticiones. Si
          eso te aplica, la normativa de protección de datos de tu jurisdicción se aplica a tu
          instancia de MCLog igual que a cualquier otra base de datos tuya. Lo que MCLog te da para
          gestionarlo son la retención automática, la purga selectiva, los roles de usuario y las
          API keys con permisos acotados; el uso que hagas de ellos es cosa tuya.
        </p>
        <p>
          Como recomendación práctica: no metas en <code>metadata</code> volcados completos de
          registros. Manda los identificadores que necesitas para investigar y poco más.
        </p>

        <h2 id="este-sitio">Este sitio web</h2>
        <p>
          La documentación que estás leyendo es un sitio estático alojado en{" "}
          <strong>GitHub Pages</strong>. Por nuestra parte:
        </p>
        <ul>
          <li>
            <strong>No usa cookies</strong> ni almacenamiento del navegador.
          </li>
          <li>
            <strong>No lleva analítica</strong>, ni de Google ni de nadie, ni píxeles de seguimiento.
          </li>
          <li>
            <strong>No carga recursos de terceros</strong>: las tipografías se sirven desde este
            mismo dominio, no desde Google Fonts.
          </li>
          <li>No hay formularios: no se recoge ningún dato que puedas introducir.</li>
        </ul>
        <p>
          Lo que sí ocurre, y no está bajo nuestro control, es que GitHub registra las peticiones a
          sus servidores —incluida tu dirección IP— para servir el sitio y prevenir abusos, como
          haría cualquier servidor web. Eso se rige por la{" "}
          <a href="https://docs.github.com/es/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">
            declaración de privacidad de GitHub
          </a>
          .
        </p>
        <p>
          Los enlaces salientes a GitHub, npm u otros sitios te llevan a servicios de terceros con
          sus propias políticas.
        </p>

        <h2 id="contacto">Contacto</h2>
        <p>
          Para cualquier duda sobre el proyecto, abre un issue en{" "}
          <a href={`${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer">
            el repositorio
          </a>
          . Si lo que quieres es reportar una vulnerabilidad, no uses un issue público: sigue la{" "}
          <a href={repoFile("SECURITY.md")} target="_blank" rel="noopener noreferrer">
            política de seguridad
          </a>
          .
        </p>

        <blockquote>
          <p>
            Esta página explica cómo funciona el proyecto; no es asesoramiento legal. Si operas
            MCLog con datos personales de terceros, revisa tus obligaciones con quien corresponda.
          </p>
        </blockquote>
      </div>
    </div>
  );
}
