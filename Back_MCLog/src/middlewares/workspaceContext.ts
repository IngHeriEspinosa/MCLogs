import { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest, WorkspaceContext } from "./requireAuth";
import { getFallbackWorkspace, getWorkspaceRole } from "../services/workspaceService";
import { getSetting } from "../services/settingsService";

/**
 * Resuelve el espacio de trabajo de la peticion y lo deja en `req.workspace`.
 * Va siempre despues de la autenticacion.
 *
 * - Con **API key** el espacio es el de la clave, y lo que diga la peticion se
 *   ignora: una clave nunca sale de su espacio. Cuenta como `member`, asi que
 *   jamas administra nada.
 * - Con **JWT** el espacio llega en la cabecera `X-Workspace-Id` o, para el
 *   stream en vivo (EventSource no admite cabeceras), en `?workspace=`. Sin
 *   ninguna de las dos se usa el espacio por defecto del usuario, para que los
 *   clientes que no conocen los espacios sigan funcionando. El admin de
 *   plataforma entra a cualquier espacio como dueño.
 *
 * Si el usuario no es miembro se responde 404, no 403: un 403 confirmaria que
 * ese espacio existe.
 */

const HEADER = "x-workspace-id";

const requestedWorkspaceId = (req: Request): number | null | undefined => {
  const header = req.headers[HEADER];
  const raw = (typeof header === "string" && header.trim() !== "" ? header : undefined) ?? req.query.workspace;
  if (raw === undefined || raw === "") return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const resolveWorkspace = async (req: AuthenticatedRequest): Promise<WorkspaceContext | "invalid" | null> => {
  if (req.apiKey) return { id: req.apiKey.workspaceId, role: "member" };
  if (!req.user) return null;

  const requested = requestedWorkspaceId(req);
  if (requested === null) return "invalid";
  if (requested === undefined) return getFallbackWorkspace(req.user);

  const role = await getWorkspaceRole(req.user, requested);
  return role ? { id: requested, role } : null;
};

const withWorkspace =
  (requireOwner: boolean) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const request = req as AuthenticatedRequest;
    void (async () => {
      const workspace = await resolveWorkspace(request);
      if (workspace === "invalid") {
        res.status(400).json({ error: "Invalid workspace id" });
        return;
      }
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found" });
        return;
      }
      if (requireOwner && workspace.role !== "owner") {
        res.status(403).json({ error: "Requires workspace owner" });
        return;
      }
      request.workspace = workspace;
      res.locals.workspaceId = workspace.id;
      next();
    })().catch(next);
  };

/** Exige un espacio al que la peticion tenga acceso (miembro o dueño). */
export const requireWorkspace = withWorkspace(false);

/** Exige ser dueño del espacio: administrar miembros, claves, alertas, purgar... */
export const requireWorkspaceOwner = withWorkspace(true);

/**
 * Ingesta: con API key basta la clave. Con sesion es el Lab: hay que ser dueño
 * y que el Lab este encendido en la configuracion.
 */
export const requireIngestWorkspace = (req: Request, res: Response, next: NextFunction) => {
  if ((req as AuthenticatedRequest).apiKey) return requireWorkspace(req, res, next);
  if (!getSetting("labEnabled")) {
    res.status(403).json({ error: "The Lab is disabled; send logs with an API key" });
    return;
  }
  return requireWorkspaceOwner(req, res, next);
};

/** Id del espacio ya resuelto. Llamarlo sin `requireWorkspace` delante es un error de programacion. */
export const workspaceIdOf = (req: Request): number => {
  const workspace = (req as AuthenticatedRequest).workspace;
  if (!workspace) throw new Error("workspaceIdOf() used on a route without requireWorkspace");
  return workspace.id;
};
