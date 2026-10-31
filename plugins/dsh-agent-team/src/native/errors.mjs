export class ClientError extends Error {
  constructor(code, message) { super(message); this.name = 'ClientError'; this.code = code; }
}
