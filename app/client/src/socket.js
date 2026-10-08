// 🃏 소켓 싱글톤 + 인증
import { io } from 'socket.io-client';

export const socket = io({ autoConnect: false });

export function connectSocket(userId) {
  if (socket.connected) socket.disconnect();
  socket.auth = { userId };
  socket.connect();
  socket.emit('auth', { userId });
}

export function emitAsync(event, data) {
  return new Promise((resolve) => {
    // data 없이 ack만 보낼 때 undefined를 전달하면 서버의 ack 콜백이 null로 와서 무한 대기됨.
    // 반드시 ack만 보내거나 (data, ack) 형태로 보낼 것.
    if (data === undefined) socket.emit(event, resolve);
    else socket.emit(event, data, resolve);
  });
}
