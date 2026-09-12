const { EventEmitter } = require('node:events');

// Only stdio JSON-RPC. No HTTP proxy, credential extraction, or generic renderer RPC.
class AppServerTransport extends EventEmitter {
  constructor(child, { timeoutMs = 15000, maxLineBytes = 4 * 1024 * 1024 } = {}) {
    super();
    this.child = child;
    this.timeoutMs = timeoutMs;
    this.maxLineBytes = maxLineBytes;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.closed = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.read(chunk));
    // Raw stderr may contain URLs or auth state. Do not persist or relay it.
    child.stderr.on('data', () => {});
    child.once('error', () => this.close(new Error('OpenAI runtime did not start')));
    child.once('exit', () => this.close(new Error('OpenAI runtime stopped')));
    child.stdin.on('error', () => this.close(new Error('OpenAI connection closed')));
  }
  send(value) {
    if (this.closed) throw new Error('OpenAI connection closed');
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  request(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed) return Promise.reject(new Error('OpenAI connection closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenAI request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  notify(method, params = {}) {
    this.send({ method, params });
  }
  read(chunk) {
    if (this.closed) return;
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > this.maxLineBytes) {
      this.close(new Error('OpenAI message size limit'));
      this.child.kill();
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.close(new Error('Invalid OpenAI protocol message'));
        this.child.kill();
        return;
      }
      if (!message || typeof message !== 'object') continue;
      if (message.method && message.id !== undefined) {
        // A tutor never approves tool execution, file edits, MCP, or elicitation.
        if (
          /requestApproval$/.test(message.method) &&
          /commandExecution|fileChange/.test(message.method)
        )
          this.send({ id: message.id, result: { decision: 'decline' } });
        else
          this.send({
            id: message.id,
            error: { code: -32601, message: 'Tools are unavailable in this learning client' },
          });
        this.emit('blockedRequest', message.method);
      } else if (message.method) this.emit('notification', message.method, message.params || {});
      else if (this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        // Intentionally omit raw server error details: they can contain private data.
        if (message.error) {
          const error = new Error('OpenAI server rejected request');
          error.code = message.error.code;
          pending.reject(error);
        } else pending.resolve(message.result);
      }
    }
  }
  close(error = new Error('OpenAI connection closed')) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit('closed', error);
  }
  stop() {
    this.close();
    this.child.kill();
  }
}
module.exports = { AppServerTransport };
