// 云函数：加入房间
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const { roomId } = event;
  if (!roomId || !/^\d{4}$/.test(roomId)) return { ok: false, err: '房号格式错误' };
  const res = await db.collection('cc_rooms').where({ roomId }).get();
  if (res.data.length === 0) return { ok: false, err: '房间不存在' };
  if (Date.now() - res.data[0].created > 2 * 3600 * 1000) return { ok: false, err: '房间已过期' };
  return { ok: true };
};
