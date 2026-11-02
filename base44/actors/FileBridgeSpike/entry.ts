import { Actor } from 'base44:runtime/actors';

// FB-02 probe actor — THROWAWAY. Verifies anonymous connections, conn.id
// reclaim, and function→room wake relay for the Unraid File Bridge design.
export default class extends Actor {
  conns = new Map<string, any>();

  async handleConnect(conn: any) {
    // Record identity for the spike report (anonymous vs authenticated).
    this.conns.set(conn.id, {
      identity_type: conn.identity?.type || 'unknown',
      connected_at: Date.now(),
    });
    conn.send({
      type: 'hello',
      conn_id: conn.id,
      identity_type: conn.identity?.type || 'unknown',
      room: this.instanceId,
      at: Date.now(),
    });
  }

  async handleMessage(conn: any, msg: any) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'wake') {
      // Function→room→agent relay: rebroadcast to every OTHER connection.
      for (const c of this.getConnections()) {
        if (c.id !== conn.id) {
          c.send({ type: 'commands_pending', from: msg.from || 'unknown', at: Date.now() });
        }
      }
      conn.send({ type: 'wake_ack', at: Date.now() });
      return;
    }
    if (msg.type === 'echo') {
      conn.send({ type: 'echo', payload: msg.payload, at: Date.now() });
    }
  }

  async handleClose(conn: any) {
    this.conns.delete(conn.id);
  }
}
