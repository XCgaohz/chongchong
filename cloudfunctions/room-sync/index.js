// 云函数：向房间追加一条对局消息（开火指令/状态快照/退出）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const { roomId, msg } = event;
  if (!roomId || !msg) return { ok: false };
  const _ = db.command;
  await db.collection('cc_rooms').where({ roomId }).update({
    data: { msgs: _.push(msg) }
  });
  return { ok: true };
};
