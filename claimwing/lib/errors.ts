/** Error with an HTTP status, safe to import anywhere (no Next.js dependencies). */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
