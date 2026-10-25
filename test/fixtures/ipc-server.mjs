/** Client-only wire simulator. It has no DSH imports or execution implementation. */
import { createServer } from 'node:net';
import { chmod } from 'node:fs/promises';
export const contract = { name: 'dsh-team-roles', version: 1, capabilities: ['native-session', 'durable-role-snapshots', 'native-role-settings', 'text-input', 'idempotent-admission'] };
export async function serveFakeBridge({ socketPath, bridge, protocol = 1, health = contract }) {
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); socket.on('error',()=>{});
    let body='';
    socket.on('data', async chunk => {
      body+=chunk;
      if(!body.includes('\n'))return;
      socket.pause();
      const request=JSON.parse(body);
      try {
        const value=await bridge.dispatch(request.method,request.params);
        const result=request.method==='health'?{...value,protocol:health}:value;
        socket.end(JSON.stringify({protocol,id:request.id,result})+'\n');
      }catch(error){socket.end(JSON.stringify({protocol,id:request.id,error:{code:error.code??'NATIVE_FAILURE',message:error.message}})+'\n');}
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
  await chmod(socketPath,0o600);
  return {close:async()=>{for(const socket of sockets)socket.destroy();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
