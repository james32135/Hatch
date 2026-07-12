import { getPrisma } from "./prisma.js";
import { HatchError } from "./errors.js";

/** Shared ownership check for parent/child JWT scopes. */
export async function assertChildAccess(
  req: { user: { role: string; sub: string; childId?: string } },
  childId: string,
) {
  const child = await getPrisma().child.findUnique({ where: { id: childId } });
  if (!child) throw new HatchError("not_found", "Child not found", 404);
  if (req.user.role === "parent" && child.parentId !== req.user.sub) {
    throw new HatchError("forbidden", "Not your child", 403);
  }
  if (req.user.role === "child" && req.user.childId !== childId) {
    throw new HatchError("forbidden", "Wrong child token", 403);
  }
  return child;
}

export function requireParent(req: { user: { role: string } }): void {
  if (req.user.role !== "parent") {
    throw new HatchError("forbidden_child_write", "Parents only", 403);
  }
}
