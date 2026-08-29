// 云函数：创建房间
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const { roomId } = event;
  if (!roomId || !/^\d{4}$/.test(roomId)) return { ok: false, err: '房号格式错误' };
  const exists = await db.collection('cc_rooms').where({ roomId }).get();
  if (exists.data.length > 0) {
    // 旧房间超过 2 小时视为过期，可复用房号
    if (Date.now() - exists.data[0].created < 2 * 3600 * 1000) return { ok: false, err: '房号已存在，请换一个' };
    await db.collection('cc_rooms').doc(exists.data[0]._id).remove();
  }
  await db.collection('cc_rooms').add({
    data: { roomId, msgs: [], status: 'open', created: Date.now() }
  });
  return { ok: true };
};
