export class HatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HatchError";
  }
}

export function isHatchError(err: unknown): err is HatchError {
  return err instanceof HatchError;
}
